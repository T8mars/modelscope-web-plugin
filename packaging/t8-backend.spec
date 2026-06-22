# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


root = Path(SPECPATH).parent

datas = [
    (str(root / 'templates'), 'templates'),
    (str(root / 'static'), 'static'),
]

hiddenimports = [
    'flask_cors',
    'openai',
    'requests',
    'providers.modelscope',
    'runtime_tasks',
    'task_poller',
    'image_analyzer',
    'routes',
]

a = Analysis(
    [str(root / 'web_app.py')],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='t8-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
