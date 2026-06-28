/**
 * Helper class to record canvas output to a WebM video file.
 */
window.CanvasRecorder = class CanvasRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
  }

  /**
   * Starts recording the canvas stream.
   * @param {number} fps - Frame rate to capture.
   */
  start(fps = 60) {
    if (this.isRecording) return;
    this.recordedChunks = [];

    // Capture the WebGL canvas stream
    // Some browsers might require captureStream() with capital S, others support it directly.
    const stream = this.canvas.captureStream ? this.canvas.captureStream(fps) : this.canvas.mozCaptureStream(fps);
    
    // Choose mime type
    const options = { mimeType: 'video/webm; codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm; codecs=vp8';
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      console.warn('Failed to initialize MediaRecorder with vp9/vp8, falling back to default stream type', e);
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.download();
    };

    this.mediaRecorder.start(100); // chunk data every 100ms
    this.isRecording = true;
    console.log('Recording started with mimeType:', this.mediaRecorder.mimeType);
  }

  /**
   * Stops the active recording.
   */
  stop() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
    console.log('Recording stopped');
  }

  /**
   * Triggers a browser download of the recorded WebM file.
   */
  download(filename = 'robot_simulation.webm') {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }
}
