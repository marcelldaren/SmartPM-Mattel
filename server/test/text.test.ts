import { describe, expect, it } from 'vitest'
import { stripHtml } from '../src/util/text.js'

describe('stripHtml', () => {
  it('converts <br> tags to newlines', () => {
    expect(stripHtml('Line one<br>Line two<br/>Line three')).toBe('Line one\nLine two\nLine three')
  })

  it('strips other HTML tags without leaving markup', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('leaves plain text untouched', () => {
    expect(stripHtml('Just plain text.\n\nWith a paragraph break.')).toBe('Just plain text.\n\nWith a paragraph break.')
  })

  it('collapses excessive blank lines produced by tag conversion', () => {
    expect(stripHtml('A<br><br><br>B')).toBe('A\n\nB')
  })
})
