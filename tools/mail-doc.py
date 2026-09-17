#!/usr/bin/env python3
"""Email a markdown doc to Mark as rendered HTML, with a plain-text fallback.

Usage:  python3 tools/mail-doc.py <file.md> "<subject>" [preamble.txt]

Why HTML: these docs are mostly tables of measured numbers, and Mark reads them
on a work machine where marktuttle.dev is blocked, so email is the channel.
Plain text turns every table into unreadable pipes. Mark asked for HTML
2026-09-17.

Inline styles rather than a <style> block alone: Gmail strips or ignores head
CSS unpredictably, and a table with no borders is the thing this exists to fix.
"""
import pathlib
import subprocess
import sys
from email.message import EmailMessage

import markdown

TO = 'marktuttle1@gmail.com'
FROM = 'alerts@marktuttle.dev'

INLINE = {
    '<table>': '<table style="border-collapse:collapse;margin:1em 0;font-size:14px">',
    '<th>': '<th style="border:1px solid #d0d7de;padding:6px 10px;background:#f6f8fa;text-align:left">',
    '<td>': '<td style="border:1px solid #d0d7de;padding:6px 10px">',
    '<code>': '<code style="background:#f6f8fa;padding:1px 4px;border-radius:3px;font-size:13px">',
    '<pre>': '<pre style="background:#f6f8fa;padding:10px;border-radius:6px;overflow-x:auto;font-size:13px">',
    '<blockquote>': '<blockquote style="border-left:3px solid #d0d7de;margin:1em 0;padding:0 1em;color:#57606a">',
}


def render(md_text: str) -> str:
    body = markdown.markdown(md_text, extensions=['tables', 'fenced_code', 'sane_lists'])
    for needle, repl in INLINE.items():
        body = body.replace(needle, repl)
    return (
        '<!doctype html><html><body style="margin:0;padding:16px;'
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
        'font-size:15px;line-height:1.55;color:#1f2328">'
        f'<div style="max-width:820px">{body}</div></body></html>'
    )


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    doc = pathlib.Path(sys.argv[1]).read_text()
    subject = sys.argv[2]
    preamble = pathlib.Path(sys.argv[3]).read_text() if len(sys.argv) > 3 else ''
    md_text = f'{preamble}\n\n---\n\n{doc}' if preamble else doc

    msg = EmailMessage()
    msg['From'] = FROM
    msg['To'] = TO
    msg['Subject'] = subject
    # Plain text first so it is the fallback; HTML is the preferred alternative.
    msg.set_content(md_text, subtype='plain', charset='utf-8')
    msg.add_alternative(render(md_text), subtype='html', charset='utf-8')

    sent = subprocess.run(['msmtp', '-t'], input=bytes(msg), check=False)
    # `msmtp --debug` RE-SENDS, so never reach for it to confirm a send that
    # already exited 0. The exit status is the signal.
    print(f'msmtp exit {sent.returncode}, {len(bytes(msg))} bytes, subject: {subject}')
    return sent.returncode


if __name__ == '__main__':
    raise SystemExit(main())
