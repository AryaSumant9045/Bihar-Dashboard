"""Fetch Instagram posts using the existing Chrome Instagram session."""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import browser_cookie3
import instaloader
from instaloader.exceptions import ConnectionException, LoginException


ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / "public" / "instagram-feed.json"


def load_env(path=ROOT / ".env"):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)

        os.environ.setdefault(
            key.strip(),
            value.strip().strip('"').strip("'"),
        )


def safe_media_path(post, media_root):
    pattern = re.compile(
        rf"{re.escape(post.shortcode)}\.(?:jpg|jpeg|png|mp4)$",
        re.IGNORECASE,
    )

    matches = sorted(
        path
        for path in media_root.rglob("*")
        if path.is_file() and pattern.search(path.name)
    )

    if not matches:
        return None

    return "/" + matches[0].relative_to(
        ROOT / "public"
    ).as_posix()


def load_chrome_instagram_session(loader):
    """Load Instagram cookies from Chrome Profile 3."""

    chrome_profile = (
        Path.home()
        / "Library"
        / "Application Support"
        / "Google"
        / "Chrome"
        / "Profile 3"
    )

    cookies_file = chrome_profile / "Cookies"

    if not cookies_file.exists():
        raise RuntimeError(
            f"Chrome cookie database not found:\n{cookies_file}"
        )

    print("Reading Instagram cookies from Chrome Profile 3...", flush=True)

    try:
        cookies = browser_cookie3.chrome(
            cookie_file=str(cookies_file),
            domain_name="instagram.com",
        )
    except Exception as error:
        raise RuntimeError(
            "Could not read Chrome cookies.\n"
            "Make sure Google Chrome is completely closed and "
            "try again.\n\n"
            f"Details: {error}"
        )

    instagram_count = 0

    for cookie in cookies:
        loader.context._session.cookies.set(
            cookie.name,
            cookie.value,
            domain=cookie.domain,
            path=cookie.path,
        )

        instagram_count += 1

    print(
        f"Loaded {instagram_count} Instagram cookies.",
        flush=True,
    )

    if instagram_count == 0:
        raise RuntimeError(
            "No Instagram cookies were found in Chrome Profile 3."
        )

    return True


def verify_session(loader, username):
    """Verify that the imported session is actually logged in."""

    try:
        profile = instaloader.Profile.from_username(
            loader.context,
            username,
        )

        print(
            f"Instagram session appears valid for @{profile.username}.",
            flush=True,
        )

        return True

    except LoginException:
        print(
            "The Chrome Instagram session could not be authenticated.",
            flush=True,
        )
        return False

    except ConnectionException as error:
        print(
            f"Instagram connection error: {error}",
            flush=True,
        )
        return False


def main():
    load_env()

    target_account = os.getenv(
        "INSTAGRAM_TARGET",
        "jansuraajofficial",
    )

    max_posts = int(
        os.getenv(
            "INSTAGRAM_MAX_POSTS",
            "12",
        )
    )

    media_root = (
        ROOT
        / "public"
        / "instagram"
        / target_account
    )

    media_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        f"Starting Instagram fetch for @{target_account}.",
        flush=True,
    )

    loader = instaloader.Instaloader(
        dirname_pattern=str(
            media_root / "{date_utc:%Y-%m-%d}"
        ),
        filename_pattern="{shortcode}",
        download_comments=False,
        download_geotags=False,
        save_metadata=False,
        compress_json=False,
        post_metadata_txt_pattern="",
    )

    # ---------------------------------------------------------
    # USE EXISTING CHROME PROFILE 3 SESSION
    # ---------------------------------------------------------

    load_chrome_instagram_session(loader)

    # ---------------------------------------------------------
    # VERIFY SESSION
    # ---------------------------------------------------------

    session_username = os.getenv("INSTAGRAM_SESSION_USER")

    if session_username:
        if not verify_session(loader, session_username):
            return

    posts = []

    try:
        profile = instaloader.Profile.from_username(
            loader.context,
            target_account,
        )

        print(
            f"Fetching posts from @{target_account}...",
            flush=True,
        )

        for post in profile.get_posts():

            if len(posts) >= max_posts:
                break

            print(
                f"Downloading post {post.shortcode}...",
                flush=True,
            )

            loader.download_post(
                post,
                target=post.date_utc.strftime("%Y-%m-%d"),
            )

            posts.append(
                {
                    "id": post.shortcode,
                    "caption": (post.caption or "").strip(),
                    "url": (
                        f"https://www.instagram.com/"
                        f"p/{post.shortcode}/"
                    ),
                    "media": safe_media_path(
                        post,
                        media_root,
                    ),
                    "is_video": post.is_video,
                    "published_at": (
                        post.date_utc
                        .replace(tzinfo=timezone.utc)
                        .isoformat()
                    ),
                }
            )

    except LoginException as error:
        print(
            f"Instagram authentication failed: {error}",
            flush=True,
        )
        print(
            "Chrome Profile 3 does not appear to have a usable "
            "Instagram session.",
            flush=True,
        )
        return

    except ConnectionException as error:
        print(
            f"Instagram connection blocked temporarily: {error}",
            flush=True,
        )
        return

    MANIFEST_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest = {
        "account": target_account,
        "profile_url": (
            f"https://www.instagram.com/"
            f"{target_account}/"
        ),
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "posts": posts,
    }

    MANIFEST_PATH.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        f"Saved {len(posts)} Instagram posts "
        f"for @{target_account}.",
        flush=True,
    )


if __name__ == "__main__":
    main()