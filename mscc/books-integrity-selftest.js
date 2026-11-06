import AdmZip from 'adm-zip'
import {
  rankBookSearchResults,
  sendDocument,
  validateBookDocument,
  _test,
} from './sources/books/_shared.js'

const matches = rankBookSearchResults('percy jackson', [
  { title:'Poetry', author:'Ring Lardner' },
  { title:'The Lightning Thief', author:'Rick Riordan', series:'Percy Jackson and the Olympians' },
])
if (matches.length !== 1 || matches[0].title !== 'The Lightning Thief') {
  throw new Error('Search relevance should remove unrelated titles and retain series metadata matches.')
}

const zip = new AdmZip()
zip.addFile('mimetype', Buffer.from('application/epub+zip'))
zip.addFile('META-INF/container.xml', Buffer.from(
  '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
))
zip.addFile('OEBPS/content.opf', Buffer.from(
  '<?xml version="1.0"?><package><manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
))
zip.addFile('OEBPS/chapter1.xhtml', Buffer.from(
  '<html><body><h1>Chapter 1</h1>' + Array.from({ length:500 }, (_, index) => '<p>Paragraph ' + index + ': alpha beta gamma delta ' + index + '.</p>').join('') + '</body></html>',
))
const epub = zip.toBuffer()
const epubCheck = validateBookDocument(epub, {
  mimetype:'application/epub+zip',
  fileName:'valid-book.epub',
})
if (!epubCheck.valid || epubCheck.kind !== 'epub' || epubCheck.bytes !== epub.length) {
  throw new Error('Valid EPUB was not accepted.')
}

let truncatedRejected = false
try {
  validateBookDocument(epub.subarray(0, epub.length - 24), {
    mimetype:'application/epub+zip',
    fileName:'truncated-book.epub',
  })
} catch {
  truncatedRejected = true
}
if (!truncatedRejected) throw new Error('Truncated EPUB was accepted.')

let htmlRejected = false
try {
  validateBookDocument(Buffer.from('<html><body>download page</body></html>'.padEnd(300, ' ')), {
    mimetype:'application/epub+zip',
    fileName:'fake-book.epub',
  })
} catch {
  htmlRejected = true
}
if (!htmlRejected) throw new Error('An HTML response disguised as an EPUB was accepted.')

let tinyTxtRejected = false
try {
  validateBookDocument(Buffer.from('not a whole book'), {
    mimetype:'text/plain',
    fileName:'tiny-book.txt',
  })
} catch {
  tinyTxtRejected = true
}
if (!tinyTxtRejected) throw new Error('A tiny placeholder text file was accepted.')

const textBook = Buffer.from(('This is a verified text-book paragraph.\n').repeat(40), 'utf8')
if (!validateBookDocument(textBook, { mimetype:'text/plain', fileName:'book.txt' }).valid) {
  throw new Error('Valid UTF-8 text book was rejected.')
}

const sent = []
const delivery = await sendDocument({
  send:async payload => { sent.push(payload) },
}, {
  data:epub,
  mimetype:'application/epub+zip',
  fileName:'verified.epub',
})
if (delivery.delivered !== true || delivery.bytes !== epub.length ||
    sent.length !== 1 || !Buffer.isBuffer(sent[0].document)) {
  throw new Error('Document delivery did not send the verified file bytes.')
}

if (_test.maxBookBytes('pdf') !== 100 * 1024 * 1024 ||
    _test.maxBookBytes('epub') !== 80 * 1024 * 1024) {
  throw new Error('Book download size limits are not configured correctly.')
}

console.log('PASS book document integrity, size limits and binary delivery')
