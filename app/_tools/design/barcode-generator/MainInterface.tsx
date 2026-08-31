import { barcodeUi } from "../../../content/ui";
import { eanModules, type EanResult } from "./code/ean13";

type BarcodeCopy = (typeof barcodeUi)["en"] | (typeof barcodeUi)["cs"];

type BarcodeMainInterfaceProps = {
  language: "en" | "cs";
  copy: BarcodeCopy;
  input: string;
  error: string;
  result: EanResult | null;
  onInput: (value: string) => void;
  onDownload: () => void;
};

export function BarcodeMainInterface({
  language,
  copy,
  input,
  error,
  result,
  onInput,
  onDownload,
}: BarcodeMainInterfaceProps) {
  return (
    <div className="barcode-module">
      <header className="barcode-header">
        <div><div className="module-code">DESIGN / EAN-13</div><h1>{copy.heading}</h1><p>{copy.subtitle}</p></div>
        <span className="solutions-local-badge"><i />{copy.local}</span>
      </header>
      <div className="barcode-workbench">
        <section className="barcode-controls">
          <label htmlFor="barcode-isbn">{copy.label}</label>
          <input id="barcode-isbn" inputMode="text" autoComplete="off" spellCheck={false} value={input} onChange={(event) => onInput(event.target.value)} placeholder={copy.placeholder} />
          {error && <p className="extraction-error" role="alert">{error}</p>}
          <button className="solutions-create" onClick={onDownload} disabled={!result}><span>{copy.generate}</span><b>↓</b></button>
          <p className="solutions-privacy">{copy.privacy}</p>
        </section>
        <section className={`barcode-preview-card ${result ? "is-ready" : ""}`}>
          <div className="barcode-preview-head"><span>{result ? copy.ready : "PREVIEW"}</span>{result && <b>✓ {result.source === "ISBN-10" ? copy.converted : copy.valid}</b>}</div>
          <div className="barcode-paper">
            {result ? <svg viewBox="0 0 113 78.6" role="img" aria-label={`EAN-13 ${result.digits}`}>
              <g fill="#000">{[...eanModules(result.digits)].map((bit, index) => bit === "1" ? <rect key={index} x={11 + index} y="2" width="1" height={index < 3 || (index >= 45 && index < 50) || index >= 92 ? 68 : 64} /> : null)}</g>
              <g className="barcode-preview-digits"><text x="2" y="77">{result.digits[0]}</text><text x="34" y="77" textAnchor="middle">{result.digits.slice(1, 7)}</text><text x="81" y="77" textAnchor="middle">{result.digits.slice(7)}</text></g>
            </svg> : <p>{copy.empty}</p>}
          </div>
          <dl className="barcode-specs"><div><dt>{copy.format}</dt><dd>{result?.digits || "—"}</dd></div><div><dt>{copy.size}</dt><dd>100%</dd></div><div><dt>{copy.colour}</dt><dd>K100</dd></div><div><dt>{copy.type}</dt><dd>{language === "cs" ? "VEKTOR" : "VECTOR"}</dd></div></dl>
        </section>
      </div>
    </div>
  );
}
