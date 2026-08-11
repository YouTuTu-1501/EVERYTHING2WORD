import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Packer,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  PageBreak,
  ImageRun,
  LineRuleType,
} from 'docx';
import { stripCssAndMetadata, isCssNoiseText } from '../utils/htmlCleaner';
import { autoAlignGovDocument } from '../utils/adminDocAutoAligner';

export interface DocxExportOptions {
  fontSize?: number; // font size in pt, e.g. 12, 13 or 14
  headingFontSize?: number;
  lineHeight?: number; // e.g. 1.15 or 1.25
  fontFamily?: string;
  title?: string;
  marginPreset?: 'gov' | 'normal' | 'narrow';
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
}

interface TextStyleOptions {
  bold?: boolean;
  italics?: boolean;
  underline?: object;
  subScript?: boolean;
  superScript?: boolean;
  fontSizeHalfPoints?: number;
}

// Convert base64 data URI to Uint8Array for docx ImageRun
function base64ToUint8Array(base64Data: string): Uint8Array {
  try {
    const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const binaryString = window.atob(base64Clean.trim());
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error('Error converting base64 to Uint8Array:', e);
    return new Uint8Array(0);
  }
}

// Check if a node is a block-level element
function isBlockElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (node as Element).tagName.toLowerCase();
  return [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'blockquote',
    'hr', 'pre', 'div', 'section', 'article',
    'header', 'footer', 'main', 'center'
  ].includes(tag);
}

// Check if an element contains block-level children
function hasBlockChildren(element: Element): boolean {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (isBlockElement(child)) return true;
      if (hasBlockChildren(child as Element)) return true;
    }
  }
  return false;
}

// Recursively parse inline nodes into TextRuns and ImageRuns
function parseInlineRuns(
  node: Node,
  options: DocxExportOptions,
  currentStyle: TextStyleOptions = {}
): (TextRun | ImageRun)[] {
  const runs: (TextRun | ImageRun)[] = [];
  const fontFamily = options.fontFamily || 'Times New Roman';
  const baseFontSize = (options.fontSize || 13) * 2; // in half-points (26 = 13pt)

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text && !isCssNoiseText(text)) {
        runs.push(
          new TextRun({
            text: text,
            font: fontFamily,
            size: currentStyle.fontSizeHalfPoints !== undefined ? currentStyle.fontSizeHalfPoints : baseFontSize,
            bold: currentStyle.bold,
            italics: currentStyle.italics,
            underline: currentStyle.underline,
            subScript: currentStyle.subScript,
            superScript: currentStyle.superScript,
          })
        );
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tag = elem.tagName.toLowerCase();

      if (['style', 'script', 'head', 'meta', 'link', 'title'].includes(tag)) {
        return;
      }

      if (tag === 'img') {
        const src = elem.getAttribute('src') || '';
        if (src.startsWith('data:image/')) {
          const bytes = base64ToUint8Array(src);
          if (bytes.length > 0) {
            let w = 400;
            let h = 250;
            if (elem.width && elem.width > 0) w = elem.width;
            if (elem.height && elem.height > 0) h = elem.height;

            runs.push(
              new ImageRun({
                data: bytes,
                transformation: {
                  width: Math.min(w, 500),
                  height: Math.min(h, 400),
                },
              })
            );
          }
        }
      } else if (tag === 'br') {
        runs.push(new TextRun({ text: '', break: 1 }));
      } else {
        const newStyle: TextStyleOptions = { ...currentStyle };
        const styleAttr = elem.getAttribute('style') || '';
        const styleLower = styleAttr.toLowerCase();

        // Extract font-size if explicitly defined (e.g., font-size: 11pt, 12pt, 15pt)
        const fsMatch = styleLower.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*(pt|px)/);
        if (fsMatch) {
          const val = parseFloat(fsMatch[1]);
          const unit = fsMatch[2];
          const ptVal = unit === 'px' ? Math.round(val * 0.75) : Math.round(val);
          newStyle.fontSizeHalfPoints = ptVal * 2;
        }

        if (
          tag === 'b' ||
          tag === 'strong' ||
          styleLower.includes('font-weight: bold') ||
          styleLower.includes('font-weight:700') ||
          styleLower.includes('font-weight: 700') ||
          styleLower.includes('font-weight:600') ||
          styleLower.includes('font-weight: 600')
        ) {
          newStyle.bold = true;
        }

        if (
          tag === 'i' ||
          tag === 'em' ||
          tag === 'mi' ||
          styleLower.includes('font-style: italic')
        ) {
          newStyle.italics = true;
        }

        if (tag === 'u' || styleLower.includes('text-decoration: underline')) {
          newStyle.underline = {};
        }

        if (tag === 'sub') newStyle.subScript = true;
        if (tag === 'sup') newStyle.superScript = true;

        runs.push(...parseInlineRuns(elem, options, newStyle));
      }
    }
  });

  return runs;
}

// Parse DOM container into Paragraphs and Tables
function parseContainerToDocx(
  container: Element,
  options: DocxExportOptions
): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const baseFontSize = (options.fontSize || 13) * 2;
  const headingBaseSize = (options.headingFontSize || 16) * 2;
  const fontFamily = options.fontFamily || 'Times New Roman';
  const lineHeightTwips = Math.round((options.lineHeight || 1.15) * 240);

  function getAlignment(elem: HTMLElement): AlignmentType {
    const align = (
      elem.style.textAlign ||
      elem.getAttribute('align') ||
      ''
    ).toLowerCase();
    const className = elem.className || '';
    if (align === 'center' || className.includes('text-center')) return AlignmentType.CENTER;
    if (align === 'right' || className.includes('text-right')) return AlignmentType.RIGHT;
    if (align === 'justify' || className.includes('text-justify')) return AlignmentType.JUSTIFY;
    return AlignmentType.LEFT;
  }

  let accumulatedInlineNodes: Node[] = [];

  function flushInlineNodes(parentElem?: HTMLElement) {
    if (accumulatedInlineNodes.length === 0) return;

    const tempDiv = document.createElement('div');
    accumulatedInlineNodes.forEach((n) => tempDiv.appendChild(n.cloneNode(true)));
    accumulatedInlineNodes = [];

    const runs = parseInlineRuns(tempDiv, options);
    if (runs.length > 0) {
      const align = parentElem ? getAlignment(parentElem) : AlignmentType.LEFT;
      result.push(
        new Paragraph({
          children: runs,
          alignment: align,
          spacing: { after: 120, line: lineHeightTwips, lineRule: LineRuleType.AUTO },
        })
      );
    }
  }

  container.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent && child.textContent.trim().length > 0 && !isCssNoiseText(child.textContent)) {
        accumulatedInlineNodes.push(child);
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tag = elem.tagName.toLowerCase();

      // Skip non-renderable head/style elements
      if (['style', 'script', 'head', 'meta', 'link', 'title'].includes(tag)) {
        return;
      }

      // Check page break indicator
      if (
        elem.classList.contains('page-break') ||
        elem.style.pageBreakBefore === 'always' ||
        elem.getAttribute('data-page-break') === 'true'
      ) {
        flushInlineNodes(container as HTMLElement);
        result.push(new Paragraph({ children: [new PageBreak()] }));
        return;
      }

      if (tag === 'p' || tag === 'blockquote' || (tag === 'div' && !hasBlockChildren(elem))) {
        flushInlineNodes(container as HTMLElement);
        const runs = parseInlineRuns(elem, options);
        if (runs.length > 0) {
          const styleAttr = elem.getAttribute('style') || '';
          const styleLower = styleAttr.toLowerCase();
          const hasIndent = styleLower.includes('text-indent') || elem.style.textIndent || elem.classList.contains('doc-p') || elem.classList.contains('gov-p');

          let spaceAfter = 100; // ~5pt
          let spaceBefore = 0;
          if (styleLower.includes('margin-bottom')) {
            const mbMatch = styleLower.match(/margin-bottom\s*:\s*(\d+(?:\.\d+)?)\s*(pt|px)/);
            if (mbMatch) spaceAfter = Math.round(parseFloat(mbMatch[1]) * 20);
          }
          if (styleLower.includes('margin-top')) {
            const mtMatch = styleLower.match(/margin-top\s*:\s*(\d+(?:\.\d+)?)\s*(pt|px)/);
            if (mtMatch) spaceBefore = Math.round(parseFloat(mtMatch[1]) * 20);
          }

          result.push(
            new Paragraph({
              children: runs,
              alignment: getAlignment(elem),
              spacing: {
                before: spaceBefore,
                after: spaceAfter,
                line: lineHeightTwips,
                lineRule: LineRuleType.AUTO,
              },
              indent: hasIndent ? { firstLine: 720 } : undefined, // 720 dxa = 0.5 in = 1.27 cm
            })
          );
        }
      } else if (tag.startsWith('h') && tag.length === 2 && !isNaN(parseInt(tag.charAt(1)))) {
        flushInlineNodes(container as HTMLElement);
        const level = parseInt(tag.charAt(1), 10);
        let headingLevel = HeadingLevel.HEADING_1;
        let size = headingBaseSize + 4;

        if (level === 2) {
          headingLevel = HeadingLevel.HEADING_2;
          size = headingBaseSize;
        } else if (level >= 3) {
          headingLevel = HeadingLevel.HEADING_3;
          size = Math.max(20, headingBaseSize - 4);
        }

        const rawRuns = parseInlineRuns(elem, options);
        const headingRuns = rawRuns.map((r) => {
          if (r instanceof TextRun) {
            return new TextRun({
              text: r.text,
              bold: true,
              font: fontFamily,
              size: size,
            });
          }
          return r;
        });

        result.push(
          new Paragraph({
            children: headingRuns,
            heading: headingLevel,
            alignment: getAlignment(elem),
            spacing: { before: 200, after: 100, line: lineHeightTwips, lineRule: LineRuleType.AUTO },
          })
        );
      } else if (tag === 'ul' || tag === 'ol') {
        flushInlineNodes(container as HTMLElement);
        const isOrdered = tag === 'ol';
        let itemIndex = 1;

        elem.querySelectorAll(':scope > li').forEach((li) => {
          const runs = parseInlineRuns(li, options);
          const prefix = isOrdered ? `${itemIndex++}. ` : '• ';
          const bulletRun = new TextRun({
            text: prefix,
            bold: true,
            font: fontFamily,
            size: baseFontSize,
          });

          result.push(
            new Paragraph({
              children: [bulletRun, ...runs],
              alignment: getAlignment(li as HTMLElement),
              spacing: { after: 80, line: lineHeightTwips, lineRule: LineRuleType.AUTO },
              indent: { left: 360 },
            })
          );
        });
      } else if (tag === 'table') {
        flushInlineNodes(container as HTMLElement);
        const rows: TableRow[] = [];
        const tableElem = elem as HTMLElement;

        const tableStyle = tableElem.getAttribute('style') || '';
        const isBorderlessTable =
          tableElem.getAttribute('border') === '0' ||
          tableElem.style.border === 'none' ||
          tableElem.style.borderStyle === 'none' ||
          tableElem.classList.contains('borderless') ||
          tableElem.classList.contains('gov-header-table') ||
          tableElem.classList.contains('gov-footer-table') ||
          tableStyle.includes('border: none') ||
          tableStyle.includes('border:none');

        elem.querySelectorAll('tr').forEach((tr) => {
          const cells: TableCell[] = [];

          tr.querySelectorAll('th, td').forEach((cell) => {
            const htmlCell = cell as HTMLElement;
            const isHeader = htmlCell.tagName.toLowerCase() === 'th';
            const cellStyle = htmlCell.getAttribute('style') || '';
            
            const colSpanAttr = htmlCell.getAttribute('colspan');
            const rowSpanAttr = htmlCell.getAttribute('rowspan');
            const colSpan = colSpanAttr ? parseInt(colSpanAttr, 10) : undefined;
            const rowSpan = rowSpanAttr ? parseInt(rowSpanAttr, 10) : undefined;

            let bgHex: string | undefined = isHeader ? 'F3F4F6' : undefined;
            const bgColorAttr = htmlCell.getAttribute('bgcolor') || htmlCell.style.backgroundColor;
            if (bgColorAttr) {
              if (bgColorAttr.startsWith('#')) {
                bgHex = bgColorAttr.replace('#', '');
              } else if (bgColorAttr.includes('rgb')) {
                const rgbMatch = bgColorAttr.match(/\d+/g);
                if (rgbMatch && rgbMatch.length >= 3) {
                  bgHex = rgbMatch.slice(0, 3).map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('');
                }
              }
            }

            let cellContent = parseContainerToDocx(cell, options);
            cellContent = cellContent.filter((c) => c instanceof Paragraph || c instanceof Table);

            const cellAlign = getAlignment(htmlCell);

            if (cellContent.length === 0) {
              cellContent = [new Paragraph({ children: [], alignment: cellAlign })];
            } else if (!(cellContent[cellContent.length - 1] instanceof Paragraph)) {
              cellContent.push(new Paragraph({ children: [], alignment: cellAlign }));
            }

            const isCellBorderless =
              isBorderlessTable ||
              htmlCell.style.border === 'none' ||
              htmlCell.style.borderStyle === 'none' ||
              cellStyle.includes('border: none') ||
              cellStyle.includes('border:none');

            const cellBorders = isCellBorderless
              ? {
                  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                }
              : {
                  top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                };

            let cellWidth: { size: number; type: WidthType } | undefined = undefined;
            const widthAttr = htmlCell.style.width || htmlCell.getAttribute('width');
            if (widthAttr) {
              const percentMatch = widthAttr.match(/(\d+(?:\.\d+)?)%/);
              if (percentMatch) {
                cellWidth = {
                  size: parseFloat(percentMatch[1]),
                  type: WidthType.PERCENTAGE,
                };
              }
            }

            cells.push(
              new TableCell({
                children: cellContent,
                columnSpan: colSpan && colSpan > 1 ? colSpan : undefined,
                rowSpan: rowSpan && rowSpan > 1 ? rowSpan : undefined,
                shading: bgHex ? { fill: bgHex } : undefined,
                width: cellWidth,
                borders: cellBorders,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
              })
            );
          });

          if (cells.length > 0) {
            rows.push(new TableRow({ children: cells }));
          }
        });

        if (rows.length > 0) {
          result.push(
            new Table({
              rows: rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            })
          );
        }
      } else if (hasBlockChildren(elem)) {
        flushInlineNodes(container as HTMLElement);
        const containerBlocks = parseContainerToDocx(elem, options);
        result.push(...containerBlocks);
      } else {
        accumulatedInlineNodes.push(child);
      }
    }
  });

  flushInlineNodes(container as HTMLElement);

  return result;
}

/**
 * Builds a true OpenXML binary .docx Blob from HTML strings using the `docx` library.
 */
export async function generateDocxBlob(
  htmlContent: string | string[],
  options: DocxExportOptions = {}
): Promise<{ blob: Blob; isNativeDocx: boolean }> {
  const contents = Array.isArray(htmlContent) ? htmlContent : [htmlContent];
  const parser = new DOMParser();

  const allDocxChildren: (Paragraph | Table)[] = [];

  contents.forEach((html, index) => {
    // Apply Decree 30/2020 auto-aligner if administrative structure detected
    const alignedHtml = autoAlignGovDocument(html);
    // Strip style, script, meta blocks and raw CSS declarations
    const sanitizedHtml = stripCssAndMetadata(alignedHtml);

    const doc = parser.parseFromString(`<div>${sanitizedHtml}</div>`, 'text/html');
    const convertedChildren = parseContainerToDocx(doc.body, options);

    if (convertedChildren.length > 0) {
      allDocxChildren.push(...convertedChildren);

      // Add a page break between merged document sections
      if (index < contents.length - 1) {
        allDocxChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }
  });

  // Ensure section is never empty
  const validChildren = allDocxChildren.filter((c) => c instanceof Paragraph || c instanceof Table);
  if (validChildren.length === 0) {
    validChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Nội dung rỗng',
            font: options.fontFamily || 'Times New Roman',
            size: (options.fontSize || 13) * 2,
          }),
        ],
      })
    );
  }

  // Calculate page margins in twips (1 mm = 56.7 twips, 1 inch = 1440 twips)
  // Default preset: 'gov' (Chuẩn Nghị định 30/2020/NĐ-CP: Trên 2cm, Dưới 2cm, Trái 3cm, Phải 1.5cm)
  let topTwips = 1134;   // 20mm
  let bottomTwips = 1134; // 20mm
  let leftTwips = 1701;  // 30mm
  let rightTwips = 850;   // 15mm

  if (options.marginPreset === 'normal') {
    topTwips = 1440;    // 25.4mm (1 inch)
    bottomTwips = 1440;
    leftTwips = 1440;
    rightTwips = 1440;
  } else if (options.marginPreset === 'narrow') {
    topTwips = 720;     // 12.7mm (0.5 inch)
    bottomTwips = 720;
    leftTwips = 720;
    rightTwips = 720;
  }

  // Custom mm overrides
  if (options.marginTopMm !== undefined) topTwips = Math.round(options.marginTopMm * 56.7);
  if (options.marginBottomMm !== undefined) bottomTwips = Math.round(options.marginBottomMm * 56.7);
  if (options.marginLeftMm !== undefined) leftTwips = Math.round(options.marginLeftMm * 56.7);
  if (options.marginRightMm !== undefined) rightTwips = Math.round(options.marginRightMm * 56.7);

  const doc = new Document({
    title: options.title || 'Tai_lieu',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: topTwips,
              bottom: bottomTwips,
              left: leftTwips,
              right: rightTwips,
            },
          },
        },
        children: validChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return { blob, isNativeDocx: true };
}

/**
 * Downloads a single HTML document as a true binary .docx file
 */
export async function downloadAsDocx(
  htmlContent: string,
  fileName: string,
  options: DocxExportOptions = {}
): Promise<void> {
  const { blob } = await generateDocxBlob(htmlContent, { ...options, title: fileName });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement('a');
  downloadLink.href = url;

  const safeName = fileName.replace(/\.[^/.]+$/, '');
  downloadLink.download = `${safeName}.docx`;

  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

/**
 * Downloads merged multiple HTML contents as a single true binary .docx file
 */
export async function downloadMergedAsDocx(
  htmlContents: string[],
  filePrefix: string = 'Tai_lieu_gop',
  options: DocxExportOptions = {}
): Promise<void> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${filePrefix}_${htmlContents.length}_anh_${dateStr}`;

  const { blob } = await generateDocxBlob(htmlContents, { ...options, title: fileName });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = `${fileName}.docx`;

  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  setTimeout(() => URL.revokeObjectURL(url), 300);
}
