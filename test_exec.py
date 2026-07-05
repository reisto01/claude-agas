import asyncio
import os
import shutil


async def test():
    path = shutil.which("claude.cmd")
    assert path is not None, "claude.cmd not found in PATH"
    print(f"Resolved Path: {path}")
    argv = (path, "-p", "hai", "--output-format", "stream-json")
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=os.getcwd(),
            env=os.environ.copy(),
        )
        _, _ = await proc.communicate()
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")


asyncio.run(test())
