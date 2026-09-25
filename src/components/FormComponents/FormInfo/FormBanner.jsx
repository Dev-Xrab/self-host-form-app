import { useRef } from "react";
import useFormStore, { useFormActions } from "../../../../store/useFormStore";
import { Icons } from "../icons";
import "./form-banner.css";

// An optional decorative image across the top of the form, above the title — shown here in the
// builder and, once saved, at the top of the respondent page too (see QuestionPager's
// `bannerImage` prop). Same inline base64 approach as a question's own image (ImageBlock.jsx):
// no upload endpoint, just a data: URI that rides along with the rest of the form on Save.
export default function FormBanner() {
  const mode = useFormStore((s) => s.mode);
  const bannerImage = useFormStore((s) => s.bannerImage);
  const { setBannerImage } = useFormActions();
  const inputRef = useRef(null);

  if (mode === "view") return bannerImage ? <div className="form-banner"><img src={bannerImage} alt="" /></div> : null;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBannerImage(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const fileInput = (
    <input ref={inputRef} type="file" accept="image/*" className="field-image-input" onChange={handleFile} />
  );

  if (!bannerImage) {
    return (
      <button type="button" className="form-banner-empty" onClick={() => inputRef.current?.click()}>
        <Icons.image className="field-icon" />
        Add a banner image
        {fileInput}
      </button>
    );
  }

  return (
    <div className="form-banner">
      <img src={bannerImage} alt="" />
      <div className="form-banner-actions">
        <button type="button" className="form-banner-btn" onClick={() => inputRef.current?.click()}>
          Replace
        </button>
        <button type="button" className="form-banner-btn" onClick={() => setBannerImage(null)}>
          Remove
        </button>
        {fileInput}
      </div>
    </div>
  );
}
