import asyncio
import shutil


async def test():
    path = shutil.which("claude")
    assert path is not None, "claude not found in PATH"
    print(f"Path: {path}")
    try:
        proc = await asyncio.create_subprocess_exec(
            path,
            "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        print(f"Stdout: {stdout}")
    except Exception as e:
        print(f"Error: {e}")


asyncio.run(test())
