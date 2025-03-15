# Hindi Club Event Attendance Syste,

A  QR code attendance system for events.

## Installation

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install --upgrade pip setuptools wheel
   pip install -r requirements.txt
   ```

3. Install system dependencies (Ubuntu/Debian):
   ```bash
   sudo apt-get update
   sudo apt-get install -y libzbar0
   ```

## Running the App

```bash
streamlit run attendance_app.py
```

## Deployment on Streamlit Cloud

1. Fork this repository
2. Go to [share.streamlit.io](https://share.streamlit.io)
3. Connect your GitHub repository
4. Deploy!

## Features

- QR Code scanning for attendance
- QR Code generation for participants
- Real-time attendance statistics
- Downloadable attendance reports

## File Structure
```
├── .streamlit/
│   └── config.toml
├── pages/
│   ├── 01_QR_Generator.py
│   └── 02_Attendance_Stats.py
├── attendance_app.py
├── requirements.txt
├── packages.txt
├── runtime.txt
└── README.md
```

## CSV File Format

The app expects a CSV file with the following columns:
- Name
- Reg. No.
- ATTENDANCE (will be created if not present)

## Environment Variables

Create a `.env` file (for local development):
```
ATTENDANCE_CSV=your_csv_file.csv
```

For Streamlit Cloud, add these in the secrets management section.
