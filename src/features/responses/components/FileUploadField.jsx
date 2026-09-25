import { useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, isAllowedUploadType } from "../../../lib/fileTypes";

export default function FileUploadField({ value, onChange, disabled }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // 5MB keeps SQLite rows and JSON payloads reasonable for local self-hosting. The server
    // re-checks size, type, and the file's actual contents (server/security/uploads.js).
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is too large (max 5MB).");
      return;
    }
    if (!isAllowedUploadType(file.type)) {
      setError("This type of file can't be uploaded. Use an image, PDF, document, audio, video, or text file.");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFileName(file.name);
      onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clear = () => {
    setFileName("");
    setError(null);
    onChange(null);
  };

  return (
    <div className="answer-file-upload">
      {value ? (
        <div className="answer-file-chip">
          <span>{fileName || "1 file attached"}</span>
          <button type="button" onClick={clear} disabled={disabled}>
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="answer-file-btn"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          Add file
        </button>
      )}
      {error && <span className="answer-file-error">{error}</span>}
      <input ref={inputRef} type="file" accept={UPLOAD_ACCEPT} className="answer-file-input" onChange={handleFile} />
    </div>
  );
}
