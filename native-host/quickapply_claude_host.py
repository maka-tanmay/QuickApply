#!/usr/bin/env python3
"""Chrome native-messaging host: bridges QuickApply to the local `claude` CLI.

Receives {messages: [{role, content}...], maxTokens} and returns {content} or {error}.
Uses `claude -p` (print mode) so responses cost nothing beyond the user's
Claude subscription — no API key involved.
"""
import json
import os
import struct
import subprocess
import sys


def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        sys.exit(0)
    msg_len = struct.unpack('<I', raw_len)[0]
    return json.loads(sys.stdin.buffer.read(msg_len).decode('utf-8'))


def send_message(msg):
    data = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def find_claude():
    home = os.path.expanduser('~')
    candidates = [
        os.path.join(home, '.claude', 'local', 'claude'),
        os.path.join(home, '.local', 'bin', 'claude'),
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
    ]
    for path in candidates:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    # Chrome launches this host with a minimal PATH; try `which` with a fuller one
    env_path = os.environ.get('PATH', '') + ':/opt/homebrew/bin:/usr/local/bin:' + os.path.join(home, '.local', 'bin')
    from shutil import which
    return which('claude', path=env_path)


def main():
    request = read_message()
    claude = find_claude()
    if not claude:
        send_message({'error': 'claude CLI not found. Install Claude Code or symlink it into /usr/local/bin.'})
        return

    # Flatten chat messages into one prompt; system messages become a preamble.
    parts = []
    for m in request.get('messages', []):
        role = m.get('role', 'user')
        content = m.get('content', '')
        if role == 'system':
            parts.insert(0, content)
        else:
            parts.append(content)
    prompt = '\n\n'.join(parts)

    try:
        result = subprocess.run(
            [claude, '-p'],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            send_message({'error': (result.stderr or result.stdout or 'claude exited non-zero').strip()[:500]})
        else:
            send_message({'content': result.stdout.strip()})
    except subprocess.TimeoutExpired:
        send_message({'error': 'claude CLI timed out after 120s'})
    except Exception as e:
        send_message({'error': str(e)})


if __name__ == '__main__':
    main()
