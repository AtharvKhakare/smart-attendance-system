import { Camera, Check, RotateCcw, ShieldCheck, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Notice } from './UI.jsx';

export default function CameraDialog({ title, mode = 'register', onClose, onSubmit }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [shots, setShots] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const needed = mode === 'register' ? 3 : 1;

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOn]);

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs localhost or a secure HTTPS website in a supported browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (reason) {
      setError(reason?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings and try again.' : 'The camera could not be started. Check that it is connected and not in use by another app.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (blob) setShots((current) => [...current, blob].slice(0, mode === 'register' ? 5 : 1));
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await onSubmit(shots.slice(0, needed));
      stopCamera();
      onClose();
    } catch (reason) {
      setError(reason?.message || 'The image could not be verified. Try another capture.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#101827]/65 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="camera-title">
    <div className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-[#238f84]">Camera capture</p><h2 id="camera-title" className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">Camera access starts only after you press Start camera.</p></div><button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>
      <Notice>{error}</Notice>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#141c2a]">
        {cameraOn ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center px-6 text-center text-slate-400"><div><Camera className="mx-auto mb-2" size={30} /><p className="text-sm">Your camera preview appears here.</p></div></div>}
        <canvas ref={canvasRef} className="hidden" />
        {cameraOn && <div className="pointer-events-none absolute inset-[18%] rounded-[45%] border-2 border-dashed border-white/75" />}
        {cameraOn && <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white"><ShieldCheck className="mr-1 inline" size={13} /> Frame is sent only when submitted</div>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">{!cameraOn ? <button onClick={startCamera} className="btn-primary"><Camera size={16} /> Start camera</button> : <><button onClick={captureFrame} disabled={shots.length >= (mode === 'register' ? 5 : 1)} className="btn-primary"><Camera size={16} /> Capture</button><button onClick={stopCamera} className="btn-secondary"><Square size={15} /> Stop</button></>}</div>
        <div className="flex items-center gap-3"><span className="text-xs text-slate-500">{shots.length} captured · {needed} required</span>{shots.length > 0 && <button onClick={() => setShots([])} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Clear captures"><RotateCcw size={15} /></button>}</div>
      </div>
      {shots.length > 0 && <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700"><Check size={14} /> Captures are held in this page temporarily and will be discarded when it closes.</p>}
      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-5"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={submit} disabled={busy || shots.length < needed} className="btn-primary">{busy ? 'Verifying…' : mode === 'register' ? 'Register face' : 'Verify and mark'}</button></div>
    </div>
  </div>;
}
