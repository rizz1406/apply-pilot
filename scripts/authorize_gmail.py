import json
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: authorize_gmail.py <oauth-client-json>")

    credentials_file = Path(sys.argv[1]).resolve()
    if not credentials_file.is_file():
        raise SystemExit("OAuth client JSON was not found")

    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
    credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    if not credentials.refresh_token:
        raise SystemExit("Google did not return a refresh token; revoke the app grant and retry")

    output_dir = Path(__file__).resolve().parents[1] / "data" / "private" / "google"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "gmail-oauth.json"
    output_file.write_text(
        json.dumps(
            {
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
                "refresh_token": credentials.refresh_token,
                "scopes": list(credentials.scopes or SCOPES),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Gmail authorization stored securely at {output_file}")


if __name__ == "__main__":
    main()
