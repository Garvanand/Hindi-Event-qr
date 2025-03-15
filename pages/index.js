import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import styles from '../styles/Home.module.css';

// Constants for security and performance
const SCAN_COOLDOWN_MS = 1500; // Reduced for faster scanning
const SESSION_STORAGE_KEY = 'hindiClubAttendance';
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPT_TIMEOUT_MS = 30000; // 30 seconds

// Google Sheets URL - published to CSV format
const GOOGLE_SHEET_ID = '1y08Sk67utKyfcMqIb65ffDlArFMZkuAFy99Ym4kYYvw';
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv`;

export default function Home() {
  const [registrationData, setRegistrationData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scanResult, setScanResult] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [stats, setStats] = useState({ total: 0, present: 0 });
  const [lastScanned, setLastScanned] = useState(null);
  const [error, setError] = useState(null);
  const [scannerStarted, setScannerStarted] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [cameraId, setCameraId] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [isDirectScanning, setIsDirectScanning] = useState(false);
  const [lastDataRefresh, setLastDataRefresh] = useState(null);
  const scannerRef = useRef(null);
  const scannerDivRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const lockTimerRef = useRef(null);
  const audioRef = useRef(null);

  // Load attendance data from session storage to persist across page refreshes
  useEffect(() => {
    try {
      // Create audio element for scan feedback
      audioRef.current = new Audio('/beep.mp3');
      
      const savedData = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setAttendance(parsedData.attendance || {});
        setStats(parsedData.stats || { total: 0, present: 0 });
      }
    } catch (err) {
      console.error("Failed to load saved attendance data", err);
    }
  }, []);

  // Save attendance data to session storage whenever it changes
  useEffect(() => {
    try {
      if (Object.keys(attendance).length > 0) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          attendance,
          stats,
          timestamp: new Date().toISOString(),
          sessionId
        }));
      }
    } catch (err) {
      console.error("Failed to save attendance data", err);
    }
  }, [attendance, stats, sessionId]);

  // Load data from Google Sheets
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Add a cache-busting parameter to avoid browser caching
        const timestamp = new Date().getTime();
        const url = `${GOOGLE_SHEET_CSV_URL}&_cb=${timestamp}`;
        
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'text/csv',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch from Google Sheets: ${response.status}`);
        }
        
        const data = await response.text();
        processCSVData(data);
        setLastDataRefresh(new Date());
        setIsLoading(false);
      } catch (googleSheetsError) {
        console.warn("Failed to fetch from Google Sheets, falling back to local sample:", googleSheetsError);
        
        // Fallback to local sample data
        try {
          const localResponse = await fetch('/sample-data.csv');
          if (!localResponse.ok) {
            throw new Error(`HTTP error! Status: ${localResponse.status}`);
          }
          const localData = await localResponse.text();
          processCSVData(localData);
          setIsLoading(false);
        } catch (localError) {
          setError(`Failed to load registration data: ${localError.message}. Please check your connection.`);
          setIsLoading(false);
        }
      }
    };

    fetchData();
    
    // Set up a refresh interval (every 5 minutes)
    const refreshInterval = setInterval(() => {
      fetchData();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  // Process CSV data with validation
  const processCSVData = useCallback((csvData) => {
    Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          // Find the registration number column - in your CSV it's "Reg. No."
          const regNoKey = Object.keys(results.data[0]).find(key => 
            key.includes('Reg') || 
            key.includes('Registration')
          );
          
          const nameKey = Object.keys(results.data[0]).find(key => 
            key === 'Name' || key === 'Name.1'
          );
          
          const attendanceKey = Object.keys(results.data[0]).find(key => 
            key === 'ATTENDANCE'
          );
          
          if (!regNoKey) {
            setError("CSV must contain a column for Registration Number");
            setIsLoading(false);
            return;
          }
          
          // Process the data
          const processedData = results.data
            .filter(row => row[regNoKey] && row[regNoKey].trim() !== '')
            .map(row => {
              // Create a standardized record
              const record = {
                regNo: row[regNoKey].toString().trim().toUpperCase(),
                name: row[nameKey] ? row[nameKey].toString().trim() : 'Unknown',
                attended: attendanceKey && row[attendanceKey] ? 
                  (row[attendanceKey].toString().toLowerCase() === 'true') : false
              };
              
              return record;
            });
          
          // Check for duplicate registration numbers
          const regNos = processedData.map(item => item.regNo);
          const duplicates = regNos.filter((item, index) => regNos.indexOf(item) !== index);
          
          if (duplicates.length > 0) {
            console.warn(`Found ${duplicates.length} duplicate registration numbers`);
          }
          
          setRegistrationData(processedData);
          
          // Initialize attendance state from the CSV
          const initialAttendance = {};
          let presentCount = 0;
          
          processedData.forEach(record => {
            initialAttendance[record.regNo] = record.attended;
            if (record.attended) presentCount++;
          });
          
          // Merge with existing attendance data
          const mergedAttendance = { ...initialAttendance };
          
          // Update stats
          setAttendance(mergedAttendance);
          setStats({
            total: processedData.length,
            present: presentCount
          });
        } else {
          setError("No valid data found in the Google Sheet");
        }
      },
      error: (error) => {
        setError(`Error parsing CSV: ${error.message}`);
        setIsLoading(false);
      }
    });
  }, []);

  // Refresh data manually
  const refreshData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Add a cache-busting parameter to avoid browser caching
      const timestamp = new Date().getTime();
      const url = `${GOOGLE_SHEET_CSV_URL}&_cb=${timestamp}`;
      
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'text/csv',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from Google Sheets: ${response.status}`);
      }
      
      const data = await response.text();
      processCSVData(data);
      setLastDataRefresh(new Date());
      setIsLoading(false);
    } catch (err) {
      setError(`Failed to refresh data: ${err.message}`);
      setIsLoading(false);
    }
  };

  // Handle file upload (as backup option)
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        setError("Please upload a CSV file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target.result;
        processCSVData(csvData);
      };
      reader.onerror = () => {
        setError("Error reading file");
      };
      reader.readAsText(file);
    }
  };

  // Start QR scanner with optimized settings
  const startScanner = async () => {
    if (scannerRef.current || !scannerDivRef.current) return;
    
    try {
      // Get available cameras
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);
      
      // Default to back camera on mobile if available
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      let defaultCamera = null;
      
      if (isMobile && devices.length > 1) {
        // Try to find back camera on mobile devices
        const backCamera = devices.find(camera => 
          camera.label.toLowerCase().includes('back') || 
          camera.label.toLowerCase().includes('rear')
        );
        defaultCamera = backCamera ? backCamera.id : devices[0].id;
      } else if (devices.length > 0) {
        defaultCamera = devices[0].id;
      }
      
      setCameraId(defaultCamera);
      
      // Use direct scanning for better performance on mobile
      if (isMobile) {
        startDirectScanning(defaultCamera);
      } else {
        // Use scanner component for desktop
        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          rememberLastUsedCamera: true,
          aspectRatio: 1.0,
        };
        
        scannerRef.current = new Html5QrcodeScanner(
          "qr-reader", config
        );
        
        scannerRef.current.render(onScanSuccess, onScanFailure);
        setScannerStarted(true);
      }
    } catch (err) {
      setError(`Failed to start scanner: ${err.message}`);
    }
  };
  
  // Direct scanning method for better performance
  const startDirectScanning = (cameraId) => {
    if (!cameraId) {
      setError("No camera found");
      return;
    }
    
    try {
      html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      
      const config = {
        fps: 15,  // Higher FPS for faster scanning
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };
      
      html5QrCodeRef.current.start(
        cameraId, 
        config,
        onScanSuccess,
        onScanFailure
      )
      .then(() => {
        setIsDirectScanning(true);
        setScannerStarted(true);
      })
      .catch((err) => {
        setError(`Camera start error: ${err}`);
      });
    } catch (err) {
      setError(`Scanner initialization error: ${err.message}`);
    }
  };
  
  // Switch camera
  const switchCamera = async (newCameraId) => {
    if (isDirectScanning && html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        startDirectScanning(newCameraId);
      } catch (err) {
        setError(`Failed to switch camera: ${err.message}`);
      }
    }
  };

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (error) {
          console.error("Failed to clear scanner", error);
        }
      }
      
      if (html5QrCodeRef.current && isDirectScanning) {
        try {
          html5QrCodeRef.current.stop().catch(err => {
            console.error("Failed to stop scanner", err);
          });
        } catch (error) {
          console.error("Failed to stop scanner", error);
        }
      }
      
      if (lockTimerRef.current) {
        clearInterval(lockTimerRef.current);
      }
    };
  }, [isDirectScanning]);

  // Handle successful QR scan
  const onScanSuccess = (decodedText) => {
    // Play beep sound
    try {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log("Audio play failed:", e));
      }
    } catch (e) {
      console.log("Audio error:", e);
    }
    
    // Prevent rapid scanning of the same code
    const now = new Date().getTime();
    if (lastScanned && lastScanned.code === decodedText && now - lastScanned.time < SCAN_COOLDOWN_MS) {
      return;
    }

    setLastScanned({ code: decodedText, time: now });

    // Sanitize input
    const sanitizedInput = decodedText.trim();
    
    // Validate registration
    const registration = registrationData.find(reg => reg.regNo === sanitizedInput);
    
    if (registration) {
      // Valid registration
      setFailedAttempts(0);
      
      // Check if already marked as present
      if (attendance[sanitizedInput]) {
        setScanResult({
          success: true,
          message: "Already marked as present",
          name: registration.name,
          regNo: sanitizedInput,
          timestamp: attendance[sanitizedInput]
        });
      } else {
        // Mark as present
        const timestamp = new Date().toISOString();
        setAttendance(prev => ({
          ...prev,
          [sanitizedInput]: timestamp
        }));
        
        setScanResult({
          success: true,
          message: "Successfully verified",
          name: registration.name,
          regNo: sanitizedInput,
          timestamp
        });
        
        setStats(prev => ({
          ...prev,
          present: prev.present + 1
        }));
      }
    } else {
      // Invalid registration
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);
      
      setScanResult({
        success: false,
        message: `Invalid registration number: ${sanitizedInput}`,
        regNo: sanitizedInput
      });
      
      // Lock scanner after too many failed attempts
      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        setScannerLocked(true);
        setLockTimer(FAILED_ATTEMPT_TIMEOUT_MS / 1000);
        
        // Start countdown timer
        if (lockTimerRef.current) {
          clearInterval(lockTimerRef.current);
        }
        
        lockTimerRef.current = setInterval(() => {
          setLockTimer(prev => {
            if (prev <= 1) {
              clearInterval(lockTimerRef.current);
              setScannerLocked(false);
              setFailedAttempts(0);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }
  };

  // Handle scan failures
  const onScanFailure = (error) => {
    // Only log errors, don't display to user unless it's a permission issue
    if (error.toString().includes('permission')) {
      setError(`Camera permission denied: ${error}`);
    }
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Download full attendance report
  const downloadAttendanceReport = () => {
    try {
      const reportData = registrationData.map(reg => {
        const isPresent = !!attendance[reg.regNo];
        const timestamp = attendance[reg.regNo] || '';
        return {
          Name: reg.name,
          'Registration Number': reg.regNo,
          Status: isPresent ? 'Present' : 'Absent',
          Timestamp: isPresent ? new Date(timestamp).toLocaleString() : ''
        };
      });
      
      const csv = Papa.unparse(reportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, `hindi_club_attendance_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      setError(`Failed to download report: ${err.message}`);
    }
  };

  // Download report with only present attendees
  const downloadPresentOnlyReport = () => {
    try {
      const presentData = registrationData
        .filter(reg => !!attendance[reg.regNo])
        .map(reg => {
          const timestamp = attendance[reg.regNo];
          return {
            Name: reg.name,
            'Registration Number': reg.regNo,
            Timestamp: new Date(timestamp).toLocaleString()
          };
        });
      
      const csv = Papa.unparse(presentData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, `hindi_club_present_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      setError(`Failed to download report: ${err.message}`);
    }
  };

  // Reset attendance data
  const resetAttendance = () => {
    if (window.confirm('Are you sure you want to reset all attendance data? This cannot be undone.')) {
      setAttendance({});
      setStats(prev => ({ ...prev, present: 0 }));
      setScanResult(null);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Hindi Club QR Verification</title>
        <meta name="description" content="QR code verification system for Hindi Club events" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className={styles.header}>
        <h1>Hindi Club Event Entry</h1>
      </header>

      <main className={styles.main}>
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>Loading registration data...</p>
          </div>
        ) : (
          <>
            <div className={styles.statsContainer}>
              <div className={styles.stat}>
                <h3>Total Registrations</h3>
                <p className={styles.statValue}>{stats.total}</p>
              </div>
              <div className={styles.stat}>
                <h3>Present</h3>
                <p className={styles.statValue}>{stats.present}</p>
              </div>
              <div className={styles.stat}>
                <h3>Absent</h3>
                <p className={styles.statValue}>{stats.total - stats.present}</p>
              </div>
            </div>

            <div className={styles.dataSourceSection}>
              <h2>Data Source</h2>
              <p>Using data from Google Sheets</p>
              {lastDataRefresh && (
                <p className={styles.lastRefresh}>
                  Last refreshed: {lastDataRefresh.toLocaleTimeString()}
                </p>
              )}
              <button 
                onClick={refreshData} 
                className={styles.refreshButton}
                disabled={isLoading}
              >
                Refresh Data
              </button>
            </div>

            <div className={styles.uploadSection}>
              <h2>Registration Data</h2>
              <p className={styles.uploadNote}>Backup option: Upload your own CSV file</p>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload} 
                className={styles.fileInput}
              />
            </div>

            <div className={styles.scannerSection}>
              <div className={styles.scannerHeader}>
                <h2>Scan QR Code</h2>
                <button 
                  onClick={toggleFullscreen}
                  className={styles.fullscreenButton}
                  aria-label="Toggle fullscreen"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                  </svg>
                </button>
              </div>
              
              {scannerLocked ? (
                <div className={styles.lockedMessage}>
                  <p>Scanner locked due to too many invalid attempts</p>
                  <p>Unlocking in: {lockTimer} seconds</p>
                </div>
              ) : !scannerStarted ? (
                <button 
                  onClick={startScanner} 
                  className={styles.startButton}
                >
                  Start QR Scanner
                </button>
              ) : null}
              
              {isDirectScanning && cameras.length > 1 && (
                <div className={styles.cameraSelector}>
                  <select 
                    value={cameraId || ''} 
                    onChange={(e) => switchCamera(e.target.value)}
                    className={styles.cameraSelect}
                  >
                    {cameras.map(camera => (
                      <option key={camera.id} value={camera.id}>
                        {camera.label || `Camera ${camera.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className={styles.scannerContainer}>
                <div id="qr-reader" ref={scannerDivRef} className={styles.qrReader}></div>
                <div className={styles.scanOverlay}>
                  <div className={styles.scanTarget}>
                    <div className={`${styles.scanCorner} ${styles.topLeft}`}></div>
                    <div className={`${styles.scanCorner} ${styles.topRight}`}></div>
                    <div className={`${styles.scanCorner} ${styles.bottomLeft}`}></div>
                    <div className={`${styles.scanCorner} ${styles.bottomRight}`}></div>
                  </div>
                </div>
              </div>
            </div>

            {scanResult && (
              <div className={`${styles.resultContainer} ${scanResult.success ? styles.success : styles.error}`}>
                <h3>{scanResult.success ? 'Valid Entry' : 'Invalid Entry'}</h3>
                <p className={styles.resultMessage}>{scanResult.message}</p>
                {scanResult.name && <p className={styles.resultName}>{scanResult.name}</p>}
                {scanResult.regNo && <p className={styles.resultRegNo}>Reg No: {scanResult.regNo}</p>}
              </div>
            )}

            <div className={styles.reportSection}>
              <h2>Attendance Reports</h2>
              <div className={styles.buttonGroup}>
                <button 
                  onClick={downloadAttendanceReport} 
                  className={styles.downloadButton}
                  disabled={stats.total === 0}
                >
                  Download Full Attendance Report
                </button>
                <button 
                  onClick={downloadPresentOnlyReport} 
                  className={styles.downloadButton}
                  disabled={stats.present === 0}
                >
                  Download Present Only Report
                </button>
              </div>
              
              <div className={styles.resetSection}>
                <button 
                  onClick={resetAttendance} 
                  className={styles.resetButton}
                  disabled={stats.present === 0}
                >
                  Reset Attendance Data
                </button>
              </div>
            </div>
            
            <div className={styles.sessionInfo}>
              <p>Session ID: {sessionId.substring(0, 8)}</p>
              <p>Data is saved in this browser session</p>
            </div>
          </>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </main>

      <footer className={styles.footer}>
        <p>Hindi Club Event Management System</p>
      </footer>
    </div>
  );
} 