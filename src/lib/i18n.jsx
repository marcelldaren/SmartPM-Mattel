import { createContext, useContext, useEffect, useState } from 'react'

/**
 * English / Bahasa Indonesia UI translation.
 *
 * Deliberately a small hand-rolled layer rather than a library: this app has one flat
 * namespace and no pluralisation rules beyond simple counts, so i18next would be more
 * configuration than translation.
 *
 * SCOPE — worth being precise about, because it is visible in the product:
 * this translates UI *chrome* (navigation, buttons, labels, headings, helper text).
 * It does NOT translate model-generated content — vendor emails, search summaries,
 * assistant replies, AI recommendations — which stay in whatever language the model
 * produced. Translating those means changing the prompts, which is a separate decision.
 * Machine names, part names, and finding categories are also left alone: they are
 * plant data, not interface text, and a technician looks for the label printed on the
 * machine itself.
 */

const I18nContext = createContext(null)
const STORAGE_KEY = 'smartpm.lang'

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
]

const STRINGS = {
  en: {
    // --- Navigation & shell ---
    'nav.dashboard': 'Dashboard',
    'nav.checksheet': 'Checksheets',
    'nav.search': 'AI Search',
    'nav.assistant': 'Assistant',
    'nav.insights': 'Predictive PM',
    'nav.reports': 'Shift Report',
    'nav.approvals': 'Approvals',
    'nav.settings': 'Settings',
    'nav.signOut': 'Sign out',
    'nav.openMenu': 'Open menu',
    'nav.closeMenu': 'Close menu',
    'app.subtitle': 'PT Mattel Indonesia',
    'theme.toLight': 'Switch to light mode',
    'theme.toDark': 'Switch to dark mode',
    'lang.label': 'Language',

    // --- Common actions ---
    'common.approve': 'Approve',
    'common.reject': 'Reject',
    'common.dismiss': 'Dismiss',
    'common.submit': 'Submit',
    'common.cancel': 'Cancel',
    'common.optional': 'optional',
    'common.loading': 'Loading…',
    'common.retry': 'Try again in a moment.',
    'common.all': 'all',

    // --- Login ---
    'login.title': 'Sign in',
    'login.sub': 'Use your supervisor or technician account.',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.signingIn': 'Signing in…',

    // --- Dashboard ---
    'dash.title': 'Dashboard',
    'dash.sub': 'Preventive-maintenance activity across PTMI Plant 2.',
    'dash.newChecksheet': 'New checksheet',
    'dash.plantFloor': 'Plant floor · PTMI Plant 2',
    'dash.nominal': 'Nominal',
    'dash.caution': 'Caution',
    'dash.critical': 'Critical',
    'dash.loadingPlant': 'Loading plant status…',
    'plant.openFindings': 'open findings',
    'plant.openFinding': 'open finding',
    'plant.part': 'part',
    'plant.parts': 'parts',
    'plant.pendingParts': 'part requests pending',
    'plant.noFindings': 'No open findings',
    // --- Data values (stored in English; translated for display only) ---
    'cat.Damaged part': 'Damaged part',
    'cat.Needs replacement': 'Needs replacement',
    'cat.Needs lubrication': 'Needs lubrication',
    'cat.Misaligned': 'Misaligned',
    'cat.Leak detected': 'Leak detected',
    'cat.Abnormal noise / vibration': 'Abnormal noise / vibration',
    'sev.High': 'High',
    'sev.Medium': 'Medium',
    'sev.Low': 'Low',
    'st.Complete': 'Complete',
    'st.Flagged': 'Flagged',
    'st.Pending Approval': 'Pending approval',
    'due.today': 'PM due today',
    'due.in': 'Due in {n} days',
    'due.overdue': 'Overdue by {n} days',
    'due.on': 'Due {date}',
    'dash.checksheetsToday': 'Checksheets today',
    'dash.ofScheduled': 'of 8 scheduled',
    'dash.openFindings': 'Open findings',
    'dash.highPriority': 'high priority',
    'dash.pendingApprovals': 'Pending approvals',
    'dash.estimated': 'estimated',
    'dash.allClear': 'all clear',
    'dash.compliance': 'Compliance',
    'dash.approved': 'Approved',
    'dash.outcomes': 'Checksheet outcomes',
    'dash.bySeverity': 'Findings by severity',
    'dash.trend': 'Findings over the last 7 days',
    'dash.trendEmpty': 'No findings recorded in the last 7 days.',
    'dash.recent': 'Recent checksheets',
    'dash.lastDays': 'Last 7 days',
    'dash.records': 'records',
    'dash.colChecksheet': 'Checksheet',
    'dash.colTechnician': 'Technician',
    'dash.colDate': 'Date',
    'dash.colFindings': 'Findings',
    'dash.colStatus': 'Status',
    'dash.approvalQueue': 'Approval queue',
    'dash.reviewApprovals': 'Review approvals',
    'dash.caughtUp': 'All caught up — nothing waiting.',
    'dash.complete': 'Complete',
    'dash.flagged': 'Flagged',
    'dash.pendingApproval': 'Pending approval',
    'dash.high': 'High',
    'dash.medium': 'Medium',
    'dash.low': 'Low',

    // --- Checksheet ---
    'cs.title': 'Digital Checksheet',
    'cs.sub': 'Preventive-maintenance verification — complete every inspection point.',
    'cs.workOrder': 'Work order',
    'cs.autoAssigned': 'Auto-assigned',
    'cs.machine': 'Machine',
    'cs.technician': 'Technician',
    'cs.selectMachine': 'Select machine…',
    'cs.selectTechnician': 'Select technician…',
    'cs.inspectionPoints': 'Inspection points',
    'cs.finding': 'finding',
    'cs.findings': 'findings',
    'cs.pass': 'Pass',
    'cs.fail': 'Fail',
    'cs.findingCategory': 'Finding category',
    'cs.selectCategory': 'Select category…',
    'cs.willDraft': 'A vendor part request will be drafted automatically on submit.',
    'cs.loggedOnly': 'Logged for auditor review — no part request needed.',
    'cs.attachPhoto': 'Attach evidence photo',
    'cs.readingPhoto': 'Reading photo…',
    'cs.photoHint': 'optional · checked against this category by AI',
    'cs.willBeChecked': 'will be AI-checked after submit',
    'cs.removePhoto': 'Remove photo',
    'cs.emptyTitle': 'Select a machine to load its PM checklist',
    'cs.emptyBody': 'Each machine has its own inspection template.',
    'cs.generalPhotos': 'General photos',
    'cs.notAiChecked': 'optional · not AI-checked',
    'cs.dropPhotos': 'Drop photos here or click to browse',
    'cs.dropHint': 'Attach evidence for failed points · JPG/PNG up to 10 MB',
    'cs.summary': 'Submission summary',
    'cs.vendor': 'Vendor',
    'cs.date': 'Date',
    'cs.passed': 'Passed',
    'cs.submitBtn': 'Submit checksheet',
    'cs.submitting': 'Submitting… (AI drafting may take a moment)',
    'cs.hintSelectMachine': 'Select a machine to begin',
    'cs.hintSelectTech': 'Select a technician',
    'cs.hintRemaining': 'inspection points remaining',
    'cs.hintCategories': 'Select a finding category for',
    'cs.hintReady': 'Ready — will be signed as',
    'cs.doneTitle': 'Checksheet submitted',
    'cs.signedBy': 'signed by',
    'cs.photoVerification': 'Photo verification',
    'cs.claimed': 'claimed',
    'cs.advisoryOnly': 'Advisory only — this never changes the finding or blocks the submission.',
    'cs.draftedByAgent': 'Drafted by the AI agent — waiting for supervisor approval.',
    'cs.newChecksheet': 'New checksheet',
    'cs.viewDashboard': 'View dashboard',

    // --- Verification badges ---
    'verify.consistent': 'AI-verified',
    'verify.uncertain': 'AI: uncertain',
    'verify.mismatch': 'AI: needs a second look',
    'verify.pending': 'Verifying photo…',
    'verify.none': 'Not verified',
    'verify.whatSaw': 'What the model saw',
    'verify.whyVerdict': 'Why this verdict',
    'verify.advisory': 'advisory only, does not change the finding',
    'verify.photo': 'Attached photo',

    // --- Approvals ---
    'appr.title': 'Approvals',
    'appr.waiting': 'auto-drafted part requests waiting',
    'appr.totalEstimated': 'total estimated',
    'appr.none': 'No part requests waiting for approval.',
    'appr.autoSendBelow': 'Auto-send below',
    'appr.emptyTitle': 'All requests handled',
    'appr.emptyBody': 'New drafts appear here when a checksheet flags a part-related finding.',
    'appr.needsApproval': 'Needs approval',
    'appr.autoSent': 'Auto-sent',
    'appr.sent': 'Sent',
    'appr.rejected': 'Rejected',
    'appr.showFull': 'Show full email',
    'appr.collapse': 'Collapse',
    'appr.approveSend': 'Approve & send',
    'appr.sending': 'Sending…',
    'appr.fromCatalog': 'Estimated from part catalog',
    'appr.aboveThreshold': 'above auto-send threshold',
    'appr.reviewed': 'AI-reviewed',
    'appr.reviewFlagged': 'Review flagged an issue',
    'appr.reviewAdvisory': 'Advisory only — you can still approve or reject this request.',
    'appr.smartProcurement': 'Smart procurement',
    'appr.draftPOs': 'Draft consolidated POs',
    'appr.drafting': 'Drafting consolidated purchase orders…',
    'appr.nothingToConsolidate': 'Nothing to consolidate right now.',
    'appr.items': 'items',
    'appr.approveAllAsOne': 'Approve all {n} & send as one PO',
    'appr.oneEmailInstead': 'Approving sends one email covering {n} requests, instead of {n} separate ones.',

    // --- Search ---
    'search.title': 'AI Search',
    'search.sub': 'Ask questions across every digitized PM record in natural language.',
    'search.placeholder': 'e.g. show me all spark plug issues on Line 7',
    'search.button': 'Search',
    'search.try': 'Try:',
    'search.emptyTitle': 'Search across all digitized maintenance history',
    'search.emptyBody':
      'Findings by machine, recurring issues, part-order history — retrieval runs over every submitted checksheet, not just filenames.',
    'search.failed': 'Search failed',
    'search.aiSummary': 'AI summary',
    'search.matching': 'matching records · semantic retrieval over',
    'search.whyMatched': 'Why this matched:',
    'search.slowNote': 'Running the retrieval — this can take several seconds',

    // --- Assistant ---
    'asst.title': 'Assistant',
    'asst.sub': 'Ask about maintenance records — it uses live tools over your real data.',
    'asst.emptyTitle': 'Ask the maintenance assistant anything',
    'asst.emptyBody':
      "It can search records, check recurring issues, look up a machine's status, and review the approval queue — then answer in plain language.",
    'asst.placeholder': 'Ask about machines, findings, recurring issues, approvals…',
    'asst.send': 'Send',
    'asst.thinking': 'Thinking & checking records…',
    'asst.toolsRun': 'Tools run',

    // --- Predictive PM ---
    'pm.title': 'Predictive PM',
    'pm.sub': 'Recurring inspection failures the reliability agent flags for bringing maintenance forward.',
    'pm.reanalyze': 'Re-analyze',
    'pm.analyzing': 'Analyzing recurrence patterns…',
    'pm.nothingTitle': 'Nothing trending yet',
    'pm.nothingBody':
      'No inspection point has failed more than once. As checksheets accumulate, repeat failures surface here with a recommended predictive-maintenance action.',
    'pm.summary': 'Reliability summary',
    'pm.recurringPoints': 'recurring inspection points · ranked by occurrence count',
    'pm.priority': 'priority',
    'pm.pmInterval': 'PM interval',
    'pm.lastPm': 'last PM',
    'pm.schedTitle': 'Scheduling recommendations',
    'pm.schedSub': "Proposals to bring a machine's next PM forward, based on its failure interval",
    'pm.schedAwaiting': 'proposals awaiting a decision',
    'pm.propose': 'Propose changes',
    'pm.proposing': 'Analyzing…',
    'pm.noProposals': 'No proposals waiting.',
    'pm.runPropose': 'Run "Propose changes" after new findings come in.',
    'pm.supervisorCan': 'A supervisor can generate these.',
    'pm.daysEarlier': 'days earlier',
    'pm.failed': 'failed',
    'pm.howCalculated': 'How this date was calculated:',
    'pm.approveResched': 'Approve & reschedule',
    'pm.applying': 'Applying…',
    'pm.changeLog': 'Schedule change log',
    'pm.nextPm': 'next PM',
    'pm.by': 'by',

    // --- Reports ---
    'rep.title': 'Shift Report',
    'rep.sub': 'One-click AI summary of the shift, generated from real numbers.',
    'rep.generate': 'Generate report',
    'rep.generating': 'Writing the shift report…',

    // --- Settings ---
    'set.title': 'Settings',
    'set.sub': 'AI engine and approval rules.',
    'set.aiEngine': 'AI engine',
    'set.local': 'Local (Ollama)',
    'set.gemini': 'Gemini',
    'set.threshold': 'Auto-approve threshold',
    'set.save': 'Save',
    'set.saved': 'Saved',

    // --- Paper checksheet scanning ---
    'scan.entry': 'Scan paper sheet',
    'scan.title': 'Scan paper checksheet',
    'scan.align': 'Align the checksheet within this frame',
    'scan.capture': 'Capture',
    'scan.retake': 'Retake',
    'scan.use': 'Read this sheet',
    'scan.reading': 'Reading the sheet…',
    'scan.choosePhoto': 'Choose a photo instead',
    'scan.choosePhotoPrimary': 'Choose a photo',
    'scan.close': 'Close',
    'scan.preview': 'Captured checksheet',
    'scan.hint':
      'The scan fills in the form for you to check — nothing is submitted until you press Submit yourself.',
    'scan.noCameraTitle': 'No camera available',
    'scan.noCameraBody':
      'This device has no camera, or the browser blocked it. Choose a photo of the sheet instead.',
    'scan.tooBlurry': 'Too blurry to read',
    'scan.needsGemini': 'Scanning requires the Gemini engine',
    'scan.offline': 'Scanning service unavailable',
    'scan.problem': "Couldn't read that",
    'scan.captureFailed': 'Could not capture a frame from the camera.',
    'scan.readFailed': 'Could not read that image.',
    'scan.failed': 'The scan failed.',
    'scan.applied': 'Sheet scanned — review the highlighted fields before submitting',
    'scan.bannerTitle': 'Filled in from a scanned paper sheet',
    'scan.bannerBody':
      'Check every row against the paper, then submit as normal. Nothing has been saved yet.',
    'scan.paperDate': 'Date on paper',
    'scan.flaggedForReview': 'field(s) flagged for review',
    'scan.noEdgeDetect': 'page edges not detected — read from the photo as-is',
    'scan.photoRows': 'Marked "photo attached" on paper',
    'scan.checkThis': 'Check this',
    'scan.checkCategory': 'Check this category',
    'scan.dismiss': 'Dismiss',

    // --- Warehouse inventory ---
    'nav.inventory': 'Spare Parts',
    'inv.title': 'Spare Parts Inventory',
    'inv.sub': 'Warehouse stock checked automatically before any vendor request is drafted.',
    'inv.tracked': 'Parts tracked',
    'inv.lowStock': 'Low stock',
    'inv.outOfStock': 'Out of stock',
    'inv.pendingPickup': 'Awaiting pickup',
    'inv.searchPlaceholder': 'Search by part, SKU, machine or bin…',
    'inv.all': 'All',
    'inv.level.healthy': 'In stock',
    'inv.level.low': 'Low stock',
    'inv.level.out': 'Out of stock',
    'inv.reorderAt': 'reorder at',
    'inv.reserved': 'reserved',
    'inv.anyMachine': 'Any machine',
    'inv.needsRecount': 'Flagged for recount',
    'inv.emptyTitle': 'No parts match that search',
    'inv.emptyBody': 'Try a different part name, SKU, machine or bin location.',
    'inv.pendingTitle': 'Parts waiting to be collected',
    'inv.pendingBody': 'Stock is only decremented once someone confirms they physically collected the part.',
    'inv.internal': 'Internal',
    'inv.bin': 'Bin',
    'inv.qty': 'Qty',
    'inv.confirmPickup': 'Confirm picked up',
    'inv.confirming': 'Confirming…',
    'inv.notThere': "Not actually there",
    'inv.pickedUp': 'Picked up',
    'inv.discrepancy': 'Discrepancy reported',
    'inv.pickedUpToast': 'confirmed',
    'inv.discrepancyToast': 'flagged for recount — stock left unchanged',
    'inv.left': 'left',
    'cs.inStockTitle': 'Available in the warehouse — collect, no vendor needed',
    'cs.inStockHint': 'Confirm pickup in Spare Parts once collected. No purchase order was raised.',
    'appr.vendorSection': 'Vendor part requests',
    'appr.vendorSectionHint': 'cost + approval threshold apply',
    'appr.internalSection': 'Internal pull requests',
    'appr.internalHint': 'Already in stock — no vendor, no cost, no purchase order. Confirm collection only.',
    'appr.awaitingPickup': 'awaiting pickup',
  },

  id: {
    // --- Navigasi & kerangka ---
    'nav.dashboard': 'Dasbor',
    'nav.checksheet': 'Lembar Periksa',
    'nav.search': 'Pencarian AI',
    'nav.assistant': 'Asisten',
    'nav.insights': 'PM Prediktif',
    'nav.reports': 'Laporan Shift',
    'nav.approvals': 'Persetujuan',
    'nav.settings': 'Pengaturan',
    'nav.signOut': 'Keluar',
    'nav.openMenu': 'Buka menu',
    'nav.closeMenu': 'Tutup menu',
    'app.subtitle': 'PT Mattel Indonesia',
    'theme.toLight': 'Ganti ke mode terang',
    'theme.toDark': 'Ganti ke mode gelap',
    'lang.label': 'Bahasa',

    // --- Aksi umum ---
    'common.approve': 'Setujui',
    'common.reject': 'Tolak',
    'common.dismiss': 'Abaikan',
    'common.submit': 'Kirim',
    'common.cancel': 'Batal',
    'common.optional': 'opsional',
    'common.loading': 'Memuat…',
    'common.retry': 'Coba lagi sebentar.',
    'common.all': 'semua',

    // --- Masuk ---
    'login.title': 'Masuk',
    'login.sub': 'Gunakan akun supervisor atau teknisi Anda.',
    'login.username': 'Nama pengguna',
    'login.password': 'Kata sandi',
    'login.submit': 'Masuk',
    'login.signingIn': 'Sedang masuk…',

    // --- Dasbor ---
    'dash.title': 'Dasbor',
    'dash.sub': 'Aktivitas perawatan preventif di PTMI Plant 2.',
    'dash.newChecksheet': 'Lembar periksa baru',
    'dash.plantFloor': 'Lantai produksi · PTMI Plant 2',
    'dash.nominal': 'Normal',
    'dash.caution': 'Perhatian',
    'dash.critical': 'Kritis',
    'dash.loadingPlant': 'Memuat status pabrik…',
    'plant.openFindings': 'temuan terbuka',
    'plant.openFinding': 'temuan terbuka',
    'plant.part': 'suku cadang',
    'plant.parts': 'suku cadang',
    'plant.pendingParts': 'permintaan suku cadang menunggu',
    'plant.noFindings': 'Tidak ada temuan terbuka',
    // --- Nilai data (tersimpan dalam bahasa Inggris; diterjemahkan untuk tampilan saja) ---
    'cat.Damaged part': 'Komponen rusak',
    'cat.Needs replacement': 'Perlu diganti',
    'cat.Needs lubrication': 'Perlu pelumasan',
    'cat.Misaligned': 'Tidak sejajar',
    'cat.Leak detected': 'Terdeteksi kebocoran',
    'cat.Abnormal noise / vibration': 'Suara / getaran tidak normal',
    'sev.High': 'Tinggi',
    'sev.Medium': 'Sedang',
    'sev.Low': 'Rendah',
    'st.Complete': 'Selesai',
    'st.Flagged': 'Ditandai',
    'st.Pending Approval': 'Menunggu persetujuan',
    'due.today': 'PM jatuh tempo hari ini',
    'due.in': 'Jatuh tempo dalam {n} hari',
    'due.overdue': 'Terlambat {n} hari',
    'due.on': 'Jatuh tempo {date}',
    'dash.checksheetsToday': 'Lembar periksa hari ini',
    'dash.ofScheduled': 'dari 8 terjadwal',
    'dash.openFindings': 'Temuan terbuka',
    'dash.highPriority': 'prioritas tinggi',
    'dash.pendingApprovals': 'Menunggu persetujuan',
    'dash.estimated': 'perkiraan',
    'dash.allClear': 'aman semua',
    'dash.compliance': 'Kepatuhan',
    'dash.approved': 'Disetujui',
    'dash.outcomes': 'Hasil lembar periksa',
    'dash.bySeverity': 'Temuan menurut tingkat',
    'dash.trend': 'Temuan dalam 7 hari terakhir',
    'dash.trendEmpty': 'Tidak ada temuan tercatat dalam 7 hari terakhir.',
    'dash.recent': 'Lembar periksa terbaru',
    'dash.lastDays': '7 hari terakhir',
    'dash.records': 'catatan',
    'dash.colChecksheet': 'Lembar Periksa',
    'dash.colTechnician': 'Teknisi',
    'dash.colDate': 'Tanggal',
    'dash.colFindings': 'Temuan',
    'dash.colStatus': 'Status',
    'dash.approvalQueue': 'Antrean persetujuan',
    'dash.reviewApprovals': 'Tinjau persetujuan',
    'dash.caughtUp': 'Semua beres — tidak ada yang menunggu.',
    'dash.complete': 'Selesai',
    'dash.flagged': 'Ditandai',
    'dash.pendingApproval': 'Menunggu persetujuan',
    'dash.high': 'Tinggi',
    'dash.medium': 'Sedang',
    'dash.low': 'Rendah',

    // --- Lembar periksa ---
    'cs.title': 'Lembar Periksa Digital',
    'cs.sub': 'Verifikasi perawatan preventif — lengkapi setiap titik inspeksi.',
    'cs.workOrder': 'Perintah kerja',
    'cs.autoAssigned': 'Otomatis ditetapkan',
    'cs.machine': 'Mesin',
    'cs.technician': 'Teknisi',
    'cs.selectMachine': 'Pilih mesin…',
    'cs.selectTechnician': 'Pilih teknisi…',
    'cs.inspectionPoints': 'Titik inspeksi',
    'cs.finding': 'temuan',
    'cs.findings': 'temuan',
    'cs.pass': 'Lulus',
    'cs.fail': 'Gagal',
    'cs.findingCategory': 'Kategori temuan',
    'cs.selectCategory': 'Pilih kategori…',
    'cs.willDraft': 'Permintaan suku cadang ke vendor akan dibuat otomatis saat dikirim.',
    'cs.loggedOnly': 'Dicatat untuk tinjauan auditor — tidak perlu permintaan suku cadang.',
    'cs.attachPhoto': 'Lampirkan foto bukti',
    'cs.readingPhoto': 'Membaca foto…',
    'cs.photoHint': 'opsional · diperiksa AI terhadap kategori ini',
    'cs.willBeChecked': 'akan diperiksa AI setelah dikirim',
    'cs.removePhoto': 'Hapus foto',
    'cs.emptyTitle': 'Pilih mesin untuk memuat daftar periksa PM-nya',
    'cs.emptyBody': 'Setiap mesin memiliki templat inspeksinya sendiri.',
    'cs.generalPhotos': 'Foto umum',
    'cs.notAiChecked': 'opsional · tidak diperiksa AI',
    'cs.dropPhotos': 'Letakkan foto di sini atau klik untuk memilih',
    'cs.dropHint': 'Lampirkan bukti untuk titik yang gagal · JPG/PNG maks 10 MB',
    'cs.summary': 'Ringkasan pengiriman',
    'cs.vendor': 'Vendor',
    'cs.date': 'Tanggal',
    'cs.passed': 'Lulus',
    'cs.submitBtn': 'Kirim lembar periksa',
    'cs.submitting': 'Mengirim… (penyusunan AI perlu waktu sebentar)',
    'cs.hintSelectMachine': 'Pilih mesin untuk memulai',
    'cs.hintSelectTech': 'Pilih teknisi',
    'cs.hintRemaining': 'titik inspeksi tersisa',
    'cs.hintCategories': 'Pilih kategori temuan untuk',
    'cs.hintReady': 'Siap — akan ditandatangani sebagai',
    'cs.doneTitle': 'Lembar periksa terkirim',
    'cs.signedBy': 'ditandatangani oleh',
    'cs.photoVerification': 'Verifikasi foto',
    'cs.claimed': 'diklaim',
    'cs.advisoryOnly': 'Hanya saran — ini tidak mengubah temuan atau menghalangi pengiriman.',
    'cs.draftedByAgent': 'Dibuat oleh agen AI — menunggu persetujuan supervisor.',
    'cs.newChecksheet': 'Lembar periksa baru',
    'cs.viewDashboard': 'Lihat dasbor',

    // --- Lencana verifikasi ---
    'verify.consistent': 'Terverifikasi AI',
    'verify.uncertain': 'AI: tidak yakin',
    'verify.mismatch': 'AI: perlu diperiksa lagi',
    'verify.pending': 'Memverifikasi foto…',
    'verify.none': 'Belum diverifikasi',
    'verify.whatSaw': 'Yang dilihat model',
    'verify.whyVerdict': 'Alasan penilaian ini',
    'verify.advisory': 'hanya saran, tidak mengubah temuan',
    'verify.photo': 'Foto terlampir',

    // --- Persetujuan ---
    'appr.title': 'Persetujuan',
    'appr.waiting': 'permintaan suku cadang menunggu',
    'appr.totalEstimated': 'total perkiraan',
    'appr.none': 'Tidak ada permintaan suku cadang yang menunggu persetujuan.',
    'appr.autoSendBelow': 'Kirim otomatis di bawah',
    'appr.emptyTitle': 'Semua permintaan sudah ditangani',
    'appr.emptyBody': 'Draf baru muncul di sini saat lembar periksa menandai temuan terkait suku cadang.',
    'appr.needsApproval': 'Perlu persetujuan',
    'appr.autoSent': 'Terkirim otomatis',
    'appr.sent': 'Terkirim',
    'appr.rejected': 'Ditolak',
    'appr.showFull': 'Tampilkan email lengkap',
    'appr.collapse': 'Tutup',
    'appr.approveSend': 'Setujui & kirim',
    'appr.sending': 'Mengirim…',
    'appr.fromCatalog': 'Perkiraan dari katalog suku cadang',
    'appr.aboveThreshold': 'di atas ambang kirim otomatis',
    'appr.reviewed': 'Ditinjau AI',
    'appr.reviewFlagged': 'Tinjauan menemukan masalah',
    'appr.reviewAdvisory': 'Hanya saran — Anda tetap dapat menyetujui atau menolak permintaan ini.',
    'appr.smartProcurement': 'Pengadaan cerdas',
    'appr.draftPOs': 'Buat PO gabungan',
    'appr.drafting': 'Menyusun pesanan pembelian gabungan…',
    'appr.nothingToConsolidate': 'Tidak ada yang bisa digabungkan saat ini.',
    'appr.items': 'item',
    'appr.approveAllAsOne': 'Setujui semua {n} & kirim sebagai satu PO',
    'appr.oneEmailInstead': 'Menyetujui akan mengirim satu email untuk {n} permintaan, bukan {n} email terpisah.',

    // --- Pencarian ---
    'search.title': 'Pencarian AI',
    'search.sub': 'Ajukan pertanyaan atas seluruh catatan PM digital dalam bahasa sehari-hari.',
    'search.placeholder': 'mis. tampilkan semua masalah busi di Line 7',
    'search.button': 'Cari',
    'search.try': 'Coba:',
    'search.emptyTitle': 'Cari di seluruh riwayat perawatan digital',
    'search.emptyBody':
      'Temuan per mesin, masalah berulang, riwayat pemesanan suku cadang — pencarian menelusuri setiap lembar periksa yang dikirim, bukan sekadar nama berkas.',
    'search.failed': 'Pencarian gagal',
    'search.aiSummary': 'Ringkasan AI',
    'search.matching': 'catatan cocok · pencarian semantik untuk',
    'search.whyMatched': 'Alasan kecocokan:',
    'search.slowNote': 'Menjalankan pencarian — ini bisa memakan beberapa detik',

    // --- Asisten ---
    'asst.title': 'Asisten',
    'asst.sub': 'Tanyakan tentang catatan perawatan — menggunakan data Anda secara langsung.',
    'asst.emptyTitle': 'Tanyakan apa saja pada asisten perawatan',
    'asst.emptyBody':
      'Bisa mencari catatan, memeriksa masalah berulang, melihat status mesin, dan meninjau antrean persetujuan — lalu menjawab dengan bahasa sederhana.',
    'asst.placeholder': 'Tanya soal mesin, temuan, masalah berulang, persetujuan…',
    'asst.send': 'Kirim',
    'asst.thinking': 'Berpikir & memeriksa catatan…',
    'asst.toolsRun': 'Alat dijalankan',

    // --- PM Prediktif ---
    'pm.title': 'PM Prediktif',
    'pm.sub': 'Kegagalan inspeksi berulang yang ditandai agen keandalan untuk memajukan perawatan.',
    'pm.reanalyze': 'Analisis ulang',
    'pm.analyzing': 'Menganalisis pola pengulangan…',
    'pm.nothingTitle': 'Belum ada tren',
    'pm.nothingBody':
      'Belum ada titik inspeksi yang gagal lebih dari sekali. Seiring lembar periksa bertambah, kegagalan berulang akan muncul di sini beserta tindakan yang disarankan.',
    'pm.summary': 'Ringkasan keandalan',
    'pm.recurringPoints': 'titik inspeksi berulang · diurutkan berdasarkan jumlah kejadian',
    'pm.priority': 'prioritas',
    'pm.pmInterval': 'Interval PM',
    'pm.lastPm': 'PM terakhir',
    'pm.schedTitle': 'Rekomendasi penjadwalan',
    'pm.schedSub': 'Usulan memajukan jadwal PM mesin berdasarkan interval kegagalannya',
    'pm.schedAwaiting': 'usulan menunggu keputusan',
    'pm.propose': 'Usulkan perubahan',
    'pm.proposing': 'Menganalisis…',
    'pm.noProposals': 'Tidak ada usulan yang menunggu.',
    'pm.runPropose': 'Jalankan "Usulkan perubahan" setelah ada temuan baru.',
    'pm.supervisorCan': 'Supervisor dapat membuatnya.',
    'pm.daysEarlier': 'hari lebih awal',
    'pm.failed': 'gagal',
    'pm.howCalculated': 'Cara tanggal ini dihitung:',
    'pm.approveResched': 'Setujui & jadwalkan ulang',
    'pm.applying': 'Menerapkan…',
    'pm.changeLog': 'Log perubahan jadwal',
    'pm.nextPm': 'PM berikutnya',
    'pm.by': 'oleh',

    // --- Laporan ---
    'rep.title': 'Laporan Shift',
    'rep.sub': 'Ringkasan AI sekali klik untuk shift ini, dibuat dari angka sebenarnya.',
    'rep.generate': 'Buat laporan',
    'rep.generating': 'Menyusun laporan shift…',

    // --- Pengaturan ---
    'set.title': 'Pengaturan',
    'set.sub': 'Mesin AI dan aturan persetujuan.',
    'set.aiEngine': 'Mesin AI',
    'set.local': 'Lokal (Ollama)',
    'set.gemini': 'Gemini',
    'set.threshold': 'Ambang persetujuan otomatis',
    'set.save': 'Simpan',
    'set.saved': 'Tersimpan',

    // --- Pemindaian lembar periksa kertas ---
    'scan.entry': 'Pindai lembar kertas',
    'scan.title': 'Pindai lembar periksa kertas',
    'scan.align': 'Posisikan lembar periksa di dalam bingkai ini',
    'scan.capture': 'Ambil foto',
    'scan.retake': 'Foto ulang',
    'scan.use': 'Baca lembar ini',
    'scan.reading': 'Membaca lembar…',
    'scan.choosePhoto': 'Pilih foto saja',
    'scan.choosePhotoPrimary': 'Pilih foto',
    'scan.close': 'Tutup',
    'scan.preview': 'Lembar periksa yang difoto',
    'scan.hint':
      'Hasil pindai hanya mengisi formulir untuk Anda periksa — tidak ada yang dikirim sampai Anda menekan Kirim sendiri.',
    'scan.noCameraTitle': 'Kamera tidak tersedia',
    'scan.noCameraBody':
      'Perangkat ini tidak memiliki kamera, atau peramban memblokirnya. Pilih foto lembar periksa saja.',
    'scan.tooBlurry': 'Terlalu buram untuk dibaca',
    'scan.needsGemini': 'Pemindaian memerlukan mesin Gemini',
    'scan.offline': 'Layanan pemindaian tidak tersedia',
    'scan.problem': 'Tidak dapat membaca foto itu',
    'scan.captureFailed': 'Tidak dapat mengambil gambar dari kamera.',
    'scan.readFailed': 'Tidak dapat membaca gambar itu.',
    'scan.failed': 'Pemindaian gagal.',
    'scan.applied': 'Lembar terpindai — periksa kolom yang ditandai sebelum mengirim',
    'scan.bannerTitle': 'Diisi dari lembar kertas hasil pindai',
    'scan.bannerBody':
      'Periksa setiap baris terhadap kertasnya, lalu kirim seperti biasa. Belum ada data yang tersimpan.',
    'scan.paperDate': 'Tanggal di kertas',
    'scan.flaggedForReview': 'kolom ditandai untuk diperiksa',
    'scan.noEdgeDetect': 'tepi kertas tidak terdeteksi — dibaca apa adanya dari foto',
    'scan.photoRows': 'Ditandai "foto dilampirkan" di kertas',
    'scan.checkThis': 'Periksa ini',
    'scan.checkCategory': 'Periksa kategori ini',
    'scan.dismiss': 'Tutup',

    // --- Inventaris gudang ---
    'nav.inventory': 'Suku Cadang',
    'inv.title': 'Inventaris Suku Cadang',
    'inv.sub': 'Stok gudang diperiksa otomatis sebelum permintaan ke vendor dibuat.',
    'inv.tracked': 'Suku cadang terpantau',
    'inv.lowStock': 'Stok menipis',
    'inv.outOfStock': 'Stok habis',
    'inv.pendingPickup': 'Menunggu diambil',
    'inv.searchPlaceholder': 'Cari nama part, SKU, mesin, atau lokasi bin…',
    'inv.all': 'Semua',
    'inv.level.healthy': 'Tersedia',
    'inv.level.low': 'Stok menipis',
    'inv.level.out': 'Stok habis',
    'inv.reorderAt': 'pesan ulang di',
    'inv.reserved': 'dipesan',
    'inv.anyMachine': 'Semua mesin',
    'inv.needsRecount': 'Ditandai untuk hitung ulang',
    'inv.emptyTitle': 'Tidak ada part yang cocok',
    'inv.emptyBody': 'Coba nama part, SKU, mesin, atau lokasi bin yang lain.',
    'inv.pendingTitle': 'Suku cadang menunggu diambil',
    'inv.pendingBody': 'Stok baru dikurangi setelah ada yang mengonfirmasi part benar-benar diambil.',
    'inv.internal': 'Internal',
    'inv.bin': 'Bin',
    'inv.qty': 'Jml',
    'inv.confirmPickup': 'Konfirmasi sudah diambil',
    'inv.confirming': 'Mengonfirmasi…',
    'inv.notThere': 'Ternyata tidak ada',
    'inv.pickedUp': 'Sudah diambil',
    'inv.discrepancy': 'Selisih dilaporkan',
    'inv.pickedUpToast': 'dikonfirmasi',
    'inv.discrepancyToast': 'ditandai untuk hitung ulang — stok tidak diubah',
    'inv.left': 'tersisa',
    'cs.inStockTitle': 'Tersedia di gudang — ambil langsung, tanpa vendor',
    'cs.inStockHint': 'Konfirmasi pengambilan di menu Suku Cadang. Tidak ada purchase order yang dibuat.',
    'appr.vendorSection': 'Permintaan part ke vendor',
    'appr.vendorSectionHint': 'berlaku biaya + ambang persetujuan',
    'appr.internalSection': 'Permintaan ambil internal',
    'appr.internalHint': 'Sudah ada stok — tanpa vendor, tanpa biaya, tanpa purchase order. Cukup konfirmasi pengambilan.',
    'appr.awaitingPickup': 'menunggu diambil',
  },
}

function initialLang() {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'id') return stored
  return navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en'
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(initialLang)

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang)
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Non-fatal: the choice still applies for this session.
    }
  }, [lang])

  /**
   * Look up a key, falling back to English and then to the key itself — a missing
   * translation shows readable English rather than a blank or a raw token.
   * `vars` fills {placeholders}, e.g. t('appr.approveAllAsOne', { n: 4 }).
   */
  const t = (key, vars) => {
    let out = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
    }
    return out
  }

  /**
   * Translate a value that is STORED in English (finding category, severity, checksheet
   * status). Falls back to the stored string, so a value added to the database later shows
   * as-is rather than as a missing-key token.
   */
  const tv = (prefix, value) => {
    if (!value) return ''
    const key = `${prefix}.${value}`
    return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? value
  }

  /** Render a machine's PM-due label from its structured form (see parseDueLabel). */
  const tDue = (due, fallback) => {
    if (!due) return fallback ?? ''
    if (due.kind === 'today') return t('due.today')
    if (due.kind === 'in') return t('due.in', { n: due.days })
    if (due.kind === 'overdue') return t('due.overdue', { n: due.days })
    if (due.kind === 'on' && due.date) {
      const d = new Date(due.date)
      const formatted = d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
        day: 'numeric',
        month: 'short',
      })
      return t('due.on', { date: formatted })
    }
    return fallback ?? ''
  }

  return <I18nContext.Provider value={{ lang, setLang, t, tv, tDue }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return (
    useContext(I18nContext) ?? {
      lang: 'en',
      setLang: () => {},
      t: (k) => STRINGS.en[k] ?? k,
      tv: (_p, v) => v,
      tDue: (_d, f) => f ?? '',
    }
  )
}
