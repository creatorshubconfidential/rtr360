import sys, re

for fpath in sys.argv[1:]:
    with open(fpath, 'r') as f:
        content = f.read()
    # Remove duplicate 'use client' and fix disable placement
    content = content.replace(\"'use client';\\n/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet dynamically imported, types unavailable */\\n'use client';\", \"'use client';\\n/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet dynamically imported, types unavailable */\")
    with open(fpath, 'w') as f:
        f.write(content)
    print(f'  Fixed {fpath}')
