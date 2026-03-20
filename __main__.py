"""Entry point for MyDy LMS Helper TUI."""

import dotenv

dotenv.load_dotenv()

from app import MydyApp  # noqa: E402

if __name__ == "__main__":
    MydyApp().run()
