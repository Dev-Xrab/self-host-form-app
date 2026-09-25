import { useState } from "react";
import { TEMPLATE_CATEGORIES } from "../../features/forms/data/templates";
import { Icons } from "./icons";
import "./template-gallery.css";

// A small, decorative stand-in for a real form screenshot: a colored header band plus a few
// skeleton lines for fields, drawn in CSS rather than shipping real preview images — enough to
// tell templates apart at a glance without needing per-template art.
function TemplateThumb({ accent }) {
  return (
    <div className="tmpl-thumb" style={{ "--tmpl-accent": accent }}>
      <div className="tmpl-thumb-band" />
      <div className="tmpl-thumb-body">
        <span className="tmpl-thumb-line tmpl-thumb-line-title" />
        <span className="tmpl-thumb-line" />
        <span className="tmpl-thumb-line short" />
      </div>
    </div>
  );
}

function BlankThumb() {
  return (
    <div className="tmpl-thumb tmpl-thumb-blank">
      <Icons.plus />
    </div>
  );
}

function TemplateTile({ title, description, accent, blank, busy, onClick }) {
  return (
    <button type="button" className="tmpl-tile" onClick={onClick} disabled={busy} title={description}>
      {blank ? <BlankThumb /> : <TemplateThumb accent={accent} />}
      <span className="tmpl-tile-title">{busy ? "Creating…" : title}</span>
    </button>
  );
}

// Templates shown in the always-visible top row: Blank plus one representative category's worth
// of tiles, so the common case (browse a handful, or start blank) never needs the full gallery
// open. The rest of the categories only appear once "Template gallery" is expanded.
const FEATURED_CATEGORY = TEMPLATE_CATEGORIES[0];

// Two tiers, matching Google Forms' own "Start a new form" panel (the reference for this
// feature): a single always-visible row (Blank + a handful of templates), and a "Template
// gallery" disclosure below it that expands into the full set, grouped by category. Picking a
// template creates a real form through the same import path a JSON-file import already uses
// (`onPick`), so there's no separate "create from template" server route.
export default function TemplateGallery({ onBlank, onPick }) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [creatingId, setCreatingId] = useState(null);
  const [error, setError] = useState(null);

  const handlePick = async (template) => {
    setCreatingId(template.id);
    setError(null);
    try {
      await onPick(template);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingId(null);
    }
  };

  const renderTile = (template) => (
    <TemplateTile
      key={template.id}
      title={template.title}
      description={template.description}
      accent={template.accent}
      busy={creatingId === template.id}
      onClick={() => handlePick(template)}
    />
  );

  return (
    <div className="tmpl-gallery">
      <div className="tmpl-header">
        <h2 className="tmpl-heading">Start a new form</h2>
        <button
          type="button"
          className="tmpl-gallery-toggle"
          onClick={() => setGalleryOpen((v) => !v)}
          aria-expanded={galleryOpen}
        >
          Template gallery
          <Icons.chevronDown className={`tmpl-gallery-chevron ${galleryOpen ? "is-open" : ""}`} />
        </button>
      </div>

      {error && <p className="dash-form-error">{error}</p>}

      <div className="tmpl-featured-row">
        <TemplateTile title="Blank form" blank onClick={onBlank} />
        {FEATURED_CATEGORY.templates.map(renderTile)}
      </div>

      {galleryOpen && (
        <div className="tmpl-full-gallery">
          {TEMPLATE_CATEGORIES.map((category) => (
            <div className="tmpl-category" key={category.id}>
              <h3 className="tmpl-category-title">{category.name}</h3>
              <div className="tmpl-grid">{category.templates.map(renderTile)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
