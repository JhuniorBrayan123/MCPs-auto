from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from src.transport import run

if __name__ == "__main__":
    run()
