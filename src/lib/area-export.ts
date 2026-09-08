import QRCode from "qrcode";
import { zipSync, strToU8 } from "fflate";

/**
 * Batch download helpers. QR images are always generated from the plaque's
 * existing permanent slug — a download never mints a new slug.
 */

export type ExportPlaque = {
  plaqueCode: string;
  slug: string;
  nfcUrl: string;
  qrUrl: string;
  placement: string | null;
  writeStatus: string;
  verificationStatus: string;
  destinationType: string | null;
  destinationUrl: string | null;
};

export type ExportRow = {
  position: number;
  name: string;
  address: string | null;
  city: string | null;
  googlePlaceId: string;
  mapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  website: string | null;
  instagram: string | null;
  status: string;
  plaques: ExportPlaque[];
};

export function fileSafe(value: string) {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "place";
}

export function pad(position: number) {
  return String(position).padStart(3, "0");
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const MANIFEST_HEADERS = [
  "Position",
  "Business",
  "Address",
  "City",
  "Google Place ID",
  "Google Maps URL",
  "Rating",
  "Reviews",
  "Website",
  "Instagram",
  "Plaque code",
  "Public slug",
  "NFC SmartLink",
  "QR SmartLink",
  "Destination type",
  "Destination URL",
  "Placement",
  "Programming",
  "Verification",
  "Design",
  "Batch",
  "Prospect status",
  "Notes",
];

export function manifestCsv(rows: ExportRow[], batchCode: string, designType: string) {
  const design = designType === "branded" ? "Business-specific artwork" : "Generic reusable";
  const lines = [MANIFEST_HEADERS.join(",")];

  for (const row of rows) {
    const plaques: Array<ExportPlaque | null> = row.plaques.length ? row.plaques : [null];
    for (const plaque of plaques) {
      lines.push(
        [
          pad(row.position),
          row.name,
          row.address,
          row.city,
          row.googlePlaceId,
          row.mapsUri,
          row.rating,
          row.reviewCount,
          row.website,
          row.instagram,
          plaque?.plaqueCode ?? "",
          plaque?.slug ?? "",
          plaque?.nfcUrl ?? "",
          plaque?.qrUrl ?? "",
          plaque?.destinationType ?? "",
          plaque?.destinationUrl ?? "",
          plaque?.placement ?? "Not installed",
          plaque?.writeStatus ?? "Not programmed",
          plaque?.verificationStatus ?? "Not verified",
          design,
          batchCode,
          row.status.replace(/_/g, " "),
          "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

export function linksCsv(rows: ExportRow[]) {
  const lines = ["Position,Business,Plaque code,Slug,NFC SmartLink,QR SmartLink"];
  for (const row of rows) {
    for (const plaque of row.plaques) {
      lines.push(
        [pad(row.position), row.name, plaque.plaqueCode, plaque.slug, plaque.nfcUrl, plaque.qrUrl]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

export function download(filename: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function qrPngBytes(url: string) {
  const dataUrl = await QRCode.toDataURL(url, { width: 900, margin: 2, errorCorrectionLevel: "M" });
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function plaqueSheet(row: ExportRow, plaque: ExportPlaque, batchCode: string, designType: string) {
  return [
    `TAPLOCAL PLAQUE RECORD`,
    ``,
    `Batch:        ${batchCode}`,
    `Position:     #${pad(row.position)}`,
    `Business:     ${row.name}`,
    `Address:      ${row.address ?? ""}`,
    `Plaque code:  ${plaque.plaqueCode}`,
    `Slug:         ${plaque.slug}`,
    `NFC link:     ${plaque.nfcUrl}`,
    `QR link:      ${plaque.qrUrl}`,
    `Destination:  ${plaque.destinationType ?? "not set"} ${plaque.destinationUrl ?? ""}`,
    `Placement:    ${plaque.placement ?? "Not installed yet"}`,
    `Programming:  ${plaque.writeStatus} / ${plaque.verificationStatus}`,
    `Design:       ${designType === "branded" ? "Business-specific artwork" : "Generic reusable"}`,
    ``,
    `The QR and NFC links belong to the plaque, not to the business. If this`,
    `business declines, the same plaque can be reassigned in TapLocal Admin.`,
  ].join("\n");
}

const GENERIC_DESIGN = `TAPLOCAL GENERIC PLAQUE FRONT (reusable)

    ENJOYED YOUR VISIT?
    TAP TO LEAVE A REVIEW

    [ NFC ]        [ SCAN QR ]

    Powered by TapLocal Digital

This artwork carries no business name or logo, so any plaque printed with it
can be reassigned to another business without reprinting.
`;

/** Server-free ZIP package: manifest, QR images, per-plaque sheets, design note. */
export async function buildBatchZip(
  rows: ExportRow[],
  batchCode: string,
  designType: string,
  onProgress?: (done: number, total: number) => void,
) {
  const files: Record<string, Uint8Array> = {};
  files[`${batchCode}/00_MANIFEST.csv`] = strToU8(manifestCsv(rows, batchCode, designType));
  files[`${batchCode}/00_LINKS.csv`] = strToU8(linksCsv(rows));
  files[`${batchCode}/DESIGNS/GENERIC_FRONT.txt`] = strToU8(GENERIC_DESIGN);

  const all = rows.flatMap((row) => row.plaques.map((plaque) => ({ row, plaque })));
  let done = 0;
  for (const { row, plaque } of all) {
    const base = `${pad(row.position)}_${fileSafe(row.name)}_${plaque.plaqueCode}`;
    files[`${batchCode}/QR/${base}_${plaque.slug}_QR.png`] = await qrPngBytes(plaque.qrUrl);
    files[`${batchCode}/PLAQUES/${base}.txt`] = strToU8(plaqueSheet(row, plaque, batchCode, designType));
    done += 1;
    onProgress?.(done, all.length);
  }

  return zipSync(files, { level: 6 });
}
