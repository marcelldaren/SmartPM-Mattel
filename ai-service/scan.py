"""
Image preparation for paper-checksheet scanning.

Pure OpenCV, no model calls and no network. Three jobs, in this order:

  1. Reject unusable input BEFORE spending a Gemini call on it (Laplacian variance).
  2. Find the sheet of paper in the photo and flatten it (contour + perspective warp).
  3. Hand back a clean, still-photographic image.

Deliberately NOT binarized. Thresholding a page to pure black-and-white throws away the
stroke weight, pressure and shape that separate a deliberate tick from a scuff, a crease
shadow, or bleed-through from the other side — exactly the signal the extraction step
needs most. Grayscale/colour costs nothing extra and keeps that nuance.

Every step fails open: if the paper cannot be located, the original frame is returned
unwarped rather than raising, because a slightly skewed photo is still readable while a
hard error gives the technician nothing.
"""

from __future__ import annotations

import base64
import binascii
import os

import cv2
import numpy as np

# --- Tunables (env-overridable so a demo can be adjusted without a code change) --------

# Laplacian variance is resolution-sensitive: the same lens at 12 MP scores far higher
# than at 2 MP purely from pixel count. Normalising to a fixed width first is what makes
# a single threshold meaningful across a phone, a webcam, and a downscaled upload.
BLUR_NORM_WIDTH = int(os.getenv("SCAN_BLUR_NORM_WIDTH", "1000"))

# Chosen deliberately low. A checksheet is mostly white paper with sparse thin ink, which
# scores much lower than a typical photographic scene even when perfectly sharp, so a
# textbook threshold (~100) would reject good scans. The cost of being wrong is asymmetric:
# letting a marginal image through just means the model reports low confidence, while a
# false "too blurry" sends a technician back to re-shoot a photo that would have worked.
BLUR_THRESHOLD = float(os.getenv("SCAN_BLUR_THRESHOLD", "45"))

# Detection runs on a downscaled copy for speed; the corners are scaled back up so the
# warp itself still samples full resolution.
DETECT_WIDTH = int(os.getenv("SCAN_DETECT_WIDTH", "900"))

# The flattened page. Checkbox edges are ~3.7 mm on the printed A4 template; at 2000 px on
# the long edge that is ~25 px per box — comfortably readable, without a payload the size
# of the original camera frame.
OUTPUT_LONG_EDGE = int(os.getenv("SCAN_OUTPUT_LONG_EDGE", "2000"))
OUTPUT_JPEG_QUALITY = int(os.getenv("SCAN_OUTPUT_JPEG_QUALITY", "92"))

# A quad smaller than this fraction of the frame is not the page — it is a table edge, a
# tile, or a shadow. Falling back to the uncropped frame beats cropping to the wrong thing.
MIN_PAGE_AREA_RATIO = float(os.getenv("SCAN_MIN_PAGE_AREA", "0.20"))

# True long:short ratio of the paper. A4 is 1:sqrt(2); set 1.294 for US Letter.
#
# This is imposed rather than measured, because the edge lengths visible in a photo are
# foreshortened by perspective and do not carry the real ratio: a sheet shot from a normal
# hand-held angle measures ~1.12 when it is truly 1.414. Warping to the measured ratio
# squashes the page ~20% along one axis and distorts every checkbox on it. The artifact
# being scanned is a known A4 template (see templates/README.md), so its true proportions
# are a fact we already have and do not need to infer.
PAGE_ASPECT = float(os.getenv("SCAN_PAGE_ASPECT", "1.41421356"))


class ScanImageError(ValueError):
    """Input that could not be decoded as an image at all."""


# --- Decode / encode -------------------------------------------------------------------


def decode_base64_image(data: str) -> np.ndarray:
    """base64 (with or without a data: prefix) -> BGR ndarray."""
    if not data:
        raise ScanImageError("No image data received.")
    if data.startswith("data:"):
        _, _, data = data.partition(",")
    try:
        raw = base64.b64decode(data, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ScanImageError("Image data was not valid base64.") from exc

    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise ScanImageError("Could not decode that image.")
    return img


def encode_jpeg_base64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), OUTPUT_JPEG_QUALITY])
    if not ok:
        raise ScanImageError("Could not re-encode the processed image.")
    return base64.b64encode(buf.tobytes()).decode("ascii")


# --- Step 1: blur gate -----------------------------------------------------------------


def blur_score(img: np.ndarray) -> float:
    """
    Variance of the Laplacian on a width-normalised grayscale copy.

    The Laplacian is a second-derivative edge operator; a sharp image has many strong
    edge responses and therefore high variance, while blur flattens them toward zero.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    if w > BLUR_NORM_WIDTH:
        scale = BLUR_NORM_WIDTH / float(w)
        gray = cv2.resize(gray, (BLUR_NORM_WIDTH, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


# --- Step 2: locate the page and flatten it --------------------------------------------


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Sort 4 points to [top-left, top-right, bottom-right, bottom-left].

    x+y is smallest at the top-left corner and largest at the bottom-right; x-y separates
    the other two. This holds for any rotation up to ~45 degrees, which covers every
    hand-held photo taken against the on-screen alignment guide.
    """
    pts = pts.astype("float32")
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]
    rect[3] = pts[np.argmax(d)]
    return rect


def find_page_quad(img: np.ndarray) -> np.ndarray | None:
    """Largest convex 4-sided contour that plausibly is the sheet. None if not found."""
    h, w = img.shape[:2]
    scale = DETECT_WIDTH / float(w) if w > DETECT_WIDTH else 1.0
    small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else img

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    # Bilateral filtering flattens paper texture and print while keeping the page border
    # crisp — the opposite of a plain blur, which would soften the very edge we need.
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    edges = cv2.Canny(gray, 50, 150)
    # Close 1-2 px gaps where a border is broken by glare or a fold, so the outline forms
    # a single closed contour instead of several arcs.
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    small_area = float(small.shape[0] * small.shape[1])
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        if cv2.contourArea(approx) < MIN_PAGE_AREA_RATIO * small_area:
            continue
        return _order_corners(approx.reshape(4, 2)) / scale  # back to full-resolution coords
    return None


def warp_to_page(img: np.ndarray, quad: np.ndarray) -> np.ndarray:
    """
    Perspective-correct the quad to a straight rectangle of true page proportions.

    The destination size comes from PAGE_ASPECT, not from the measured edges — see the
    note on that constant. The longest measured edge sets the scale, since it is the one
    nearest the camera and therefore the least compressed of the four.
    """
    tl, tr, br, bl = quad
    measured_w = max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl))
    measured_h = max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl))
    if measured_w < 10 or measured_h < 10:
        return img

    long_edge = max(measured_w, measured_h)
    short_edge = long_edge / PAGE_ASPECT
    if measured_h >= measured_w:  # portrait, as the template is printed
        width, height = int(round(short_edge)), int(round(long_edge))
    else:
        width, height = int(round(long_edge)), int(round(short_edge))

    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype="float32")
    m = cv2.getPerspectiveTransform(quad.astype("float32"), dst)
    return cv2.warpPerspective(img, m, (width, height))


def fit_long_edge(img: np.ndarray, long_edge: int = OUTPUT_LONG_EDGE) -> np.ndarray:
    """Scale so the longest side is `long_edge`. Only ever downscales."""
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= long_edge:
        return img
    scale = long_edge / float(longest)
    return cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)


# --- Pipeline --------------------------------------------------------------------------


class PreparedScan:
    """Result of preparing one photo. `ok=False` means: do not call the model."""

    def __init__(
        self,
        *,
        ok: bool,
        reason: str | None = None,
        note: str | None = None,
        image_base64: str | None = None,
        blur: float = 0.0,
        blur_threshold: float = BLUR_THRESHOLD,
        deskewed: bool = False,
        width: int = 0,
        height: int = 0,
    ):
        self.ok = ok
        self.reason = reason
        self.note = note
        self.image_base64 = image_base64
        self.blur = blur
        self.blur_threshold = blur_threshold
        self.deskewed = deskewed
        self.width = width
        self.height = height


def prepare(image_base64: str) -> PreparedScan:
    """
    Decode -> blur gate -> page detect -> perspective correct -> downscale -> JPEG.

    The blur gate runs first and short-circuits: an unusable frame costs one cheap
    Laplacian pass instead of a multimodal API call that could only ever answer
    "I can't read this".
    """
    img = decode_base64_image(image_base64)  # raises ScanImageError; caller maps to 400

    sharpness = blur_score(img)
    if sharpness < BLUR_THRESHOLD:
        return PreparedScan(
            ok=False,
            reason="blurry",
            note=(
                "The photo is too blurry to read reliably. Hold the camera steady, make sure "
                "the sheet is well lit, and take it again."
            ),
            blur=sharpness,
        )

    quad = find_page_quad(img)
    if quad is not None:
        page = warp_to_page(img, quad)
        deskewed = True
    else:
        # No clean border — the sheet may fill the frame edge-to-edge, or sit on a
        # same-coloured surface. The photo is still readable; just skip the correction.
        page = img
        deskewed = False

    page = fit_long_edge(page)
    h, w = page.shape[:2]
    return PreparedScan(
        ok=True,
        image_base64=encode_jpeg_base64(page),
        blur=sharpness,
        deskewed=deskewed,
        width=w,
        height=h,
    )
