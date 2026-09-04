"""Fetch Instagram posts for the PK Tracker using a server-side session."""

import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import instaloader
from instaloader.exceptions import ConnectionException, LoginException

ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / "public" / "instagram-feed.json"


def load_env(path=ROOT / ".env"):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def safe_media_path(post, media_root):
    pattern = re.compile(rf"{re.escape(post.shortcode)}\.(?:jpg|jpeg|png|mp4)$", re.IGNORECASE)
    matches = sorted(path for path in media_root.rglob("*") if path.is_file() and pattern.search(path.name))
    return "/" + matches[0].relative_to(ROOT / "public").as_posix() if matches else None


def open_checkpoint(url):
    browser_app = os.getenv("INSTAGRAM_BROWSER_APP")
    browser_profile = os.getenv("INSTAGRAM_BROWSER_PROFILE")
    if browser_app == "Google Chrome" and browser_profile:
        subprocess.run(["open", "-na", browser_app, "--args", f"--profile-directory={browser_profile}", url], check=False)
        print(f"Opened checkpoint in {browser_app} profile {browser_profile}.", flush=True)
    elif browser_app:
        subprocess.run(["open", "-a", browser_app, url], check=False)
        print(f"Opened checkpoint in {browser_app}.", flush=True)
    else:
        subprocess.run(["open", url], check=False)
        print("Opened checkpoint in the macOS default browser.", flush=True)


def login_or_checkpoint(loader, username, password, session_file):
    try:
        if session_file.exists():
            loader.load_session_from_file(username, session_file)
            print("Loaded saved Instagram session.", flush=True)
        else:
            print("No saved session found; starting Instagram login.", flush=True)
            loader.login(username, password)
            loader.save_session_to_file(session_file)
            print("Instagram login succeeded and session was saved.", flush=True)
        return True
    except LoginException as error:
        checkpoint = re.search(r"(/auth_platform/\?[^ ]+)", str(error))
        print("Instagram login requires checkpoint verification.", flush=True)
        if checkpoint:
            checkpoint_url = f"https://www.instagram.com{checkpoint.group(1)}"
            print(checkpoint_url, flush=True)
            open_checkpoint(checkpoint_url)
        else:
            print("Instagram did not provide a checkpoint URL.", flush=True)
        print("Complete verification, then run: python3 fetch_instagram.py", flush=True)
        return False


def main():
    load_env()
    target_account = os.getenv("INSTAGRAM_TARGET", "jansuraajofficial")
    max_posts = int(os.getenv("INSTAGRAM_MAX_POSTS", "12"))
    username = os.getenv("INSTAGRAM_USERNAME") or os.getenv("INSTAGRAM_USER")
    password = os.getenv("INSTAGRAM_PASSWORD") or os.getenv("INSTAGRAM_PASS")
    if not username or not password:
        raise RuntimeError("Missing INSTAGRAM_USERNAME/INSTAGRAM_PASSWORD in .env")

    media_root = ROOT / "public" / "instagram" / target_account
    media_root.mkdir(parents=True, exist_ok=True)
    print(f"Starting Instagram fetch for @{target_account}.", flush=True)

    loader = instaloader.Instaloader(
        dirname_pattern=str(media_root / "{date_utc:%Y-%m-%d}"),
        filename_pattern="{shortcode}",
        download_comments=False,
        download_geotags=False,
        save_metadata=False,
        compress_json=False,
        post_metadata_txt_pattern="",
    )
    session_file = ROOT / f".instaloader-{username}.session"
    if not login_or_checkpoint(loader, username, password, session_file):
        return

    try:
        profile = instaloader.Profile.from_username(loader.context, target_account)
        posts = []
        for post in profile.get_posts():
            if len(posts) >= max_posts:
                break
            loader.download_post(post, target=post.date_utc.strftime("%Y-%m-%d"))
            posts.append({
                "id": post.shortcode,
                "caption": (post.caption or "").strip(),
                "url": f"https://www.instagram.com/p/{post.shortcode}/",
                "media": safe_media_path(post, media_root),
                "is_video": post.is_video,
                "published_at": post.date_utc.replace(tzinfo=timezone.utc).isoformat(),
            })
    except ConnectionException as error:
        print(f"Instagram fetch blocked temporarily: {error}", flush=True)
        return

    MANIFEST_PATH.write_text(json.dumps({
        "account": target_account,
        "profile_url": f"https://www.instagram.com/{target_account}/",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "posts": posts,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(posts)} Instagram posts for @{target_account}.", flush=True)


if __name__ == "__main__":
    main()
