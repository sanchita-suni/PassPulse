import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { verifyCheckIn } from '../services/checkinApi'

function GateScanner() {
  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  const [eventId, setEventId] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  async function startScanner() {
    if (!eventId.trim()) {
      setScannerError('Enter the Event ID first.')
      return
    }

    setScannerError('')
    setResult(null)

    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    try {
      const cameras = await Html5Qrcode.getCameras()

      if (!cameras.length) {
        throw new Error('No camera found.')
      }

      await scanner.start(
        cameras[0].id,
        {
          fps: 10,
          qrbox: {
            width: 250,
            height: 250,
          },
        },
        async (decodedText) => {
          if (processingRef.current) return

          processingRef.current = true

          try {
            const response = await verifyCheckIn({
              qrData: decodedText,
              eventId: eventId.trim(),
            })

            setResult({
              type: 'success',
              code: response.code,
              data: response.data,
            })
          } catch (error) {
            setResult({
              type: 'error',
              code: error.code || 'CHECKIN_FAILED',
              message: error.message || 'Check-in failed.',
            })
          } finally {
            setTimeout(() => {
              processingRef.current = false
            }, 1500)
          }
        },
        () => {
          // Normal scan misses are ignored.
        }
      )

      setIsScanning(true)
    } catch (error) {
      setScannerError(
        error.message || 'Unable to start the camera.'
      )
      scannerRef.current = null
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current

    if (!scanner) {
      setIsScanning(false)
      return
    }

    try {
      await scanner.stop()
      await scanner.clear()
    } catch {
      // Scanner may already be stopped.
    }

    scannerRef.current = null
    setIsScanning(false)
  }

  async function testCheckIn() {
    const qrData = prompt('Paste the QR data here:')

    if (!qrData) return

    if (!eventId.trim()) {
      setScannerError('Enter the Event ID first.')
      return
    }

    setScannerError('')
    setResult(null)

    try {
      const response = await verifyCheckIn({
        qrData,
        eventId: eventId.trim(),
      })

      setResult({
        type: 'success',
        code: response.code,
        data: response.data,
      })
    } catch (error) {
      setResult({
        type: 'error',
        code: error.code || 'CHECKIN_FAILED',
        message: error.message || 'Check-in failed.',
      })
    }
  }

  return (
    <main className="scanner-page">
      <section className="scanner-card">
        <h1>Gate Check-in</h1>

        <p>
          Scan an attendee QR pass to validate entry.
        </p>

        <label htmlFor="eventId">Event ID</label>

        <input
          id="eventId"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="EVT-001"
          disabled={isScanning}
        />

        <div className="scanner-container">
          <div id="qr-reader" />
        </div>

        {!isScanning ? (
          <button type="button" onClick={startScanner}>
            Start Scanner
          </button>
        ) : (
          <button type="button" onClick={stopScanner}>
            Stop Scanner
          </button>
        )}

        {!isScanning && (
          <button
            type="button"
            onClick={testCheckIn}
            style={{ marginTop: '10px' }}
          >
            Test Check-in Without Camera
          </button>
        )}

        {scannerError && (
          <div className="result error">
            {scannerError}
          </div>
        )}

        {result?.type === 'success' && (
          <div className="result success">
            <h2>Check-in Successful</h2>

            <p>Code: {result.code}</p>
            <p>Ticket: {result.data.ticketId}</p>
            <p>Attendee: {result.data.userId}</p>

            <p>
              Checked in:{' '}
              {new Date(
                result.data.checkedInAt
              ).toLocaleString()}
            </p>
          </div>
        )}

        {result?.type === 'error' && (
          <div className="result error">
            <h2>Check-in Rejected</h2>

            <p>Code: {result.code}</p>
            <p>{result.message}</p>
          </div>
        )}
      </section>
    </main>
  )
}

export default GateScanner