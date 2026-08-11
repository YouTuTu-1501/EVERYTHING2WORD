/**
 * Automatically formats and aligns Vietnamese administrative document HTML
 * according to Decree 30/2020/NĐ-CP (Nghị định 30/2020/NĐ-CP về công tác văn thư).
 */

export function autoAlignGovDocument(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== 'string') return htmlContent;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
  const container = doc.body.firstElementChild || doc.body;

  // 1. Process or Create Header Block (Quốc hiệu, Tiêu ngữ, Tên cơ quan, Số/Ký hiệu, Địa danh ngày tháng)
  ensureGovHeaderTable(container as HTMLElement);

  // 2. Format Document Type & Subject (QUYẾT ĐỊNH, THÔNG TƯ, CÔNG VĂN, Về việc...)
  formatDocumentTitleAndSubject(container as HTMLElement);

  // 3. Format Legal Bases (Căn cứ...)
  formatLegalBases(container as HTMLElement);

  // 4. Format Articles, Clauses, Points (Điều, Khoản, Điểm) & Body Paragraphs
  formatArticlesAndBody(container as HTMLElement);

  // 5. Process or Create Footer Block (Nơi nhận & Chức vụ/Họ tên người ký)
  ensureGovFooterTable(container as HTMLElement);

  return container.innerHTML;
}

/**
 * Ensures Header is structured as a 2-column borderless table
 * Left: Issuing agency (cơ quan ban hành) + Doc number (Số/Ký hiệu)
 * Right: Country motto (Quốc hiệu, Tiêu ngữ) + Location & Date (Địa danh ngày tháng)
 */
function ensureGovHeaderTable(container: HTMLElement) {
  let headerTable = container.querySelector('table.gov-header-table') as HTMLTableElement | null;

  if (!headerTable) {
    // Check if there is an existing 2-column table at top
    const firstTable = container.querySelector('table') as HTMLTableElement | null;
    if (firstTable) {
      const text = firstTable.textContent || '';
      if (
        text.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') ||
        text.includes('Độc lập - Tự do - Hạnh phúc') ||
        text.includes('Độc lập-Tự do-Hạnh phúc')
      ) {
        headerTable = firstTable;
        headerTable.classList.add('gov-header-table');
      }
    }
  }

  if (headerTable) {
    // Format existing header table
    headerTable.setAttribute('border', '0');
    headerTable.style.width = '100%';
    headerTable.style.borderCollapse = 'collapse';
    headerTable.style.border = 'none';
    headerTable.style.marginBottom = '15px';

    const cells = headerTable.querySelectorAll('td, th');
    if (cells.length >= 2) {
      const leftCell = cells[0] as HTMLElement;
      const rightCell = cells[1] as HTMLElement;

      leftCell.style.width = '45%';
      leftCell.style.verticalAlign = 'top';
      leftCell.style.textAlign = 'center';
      leftCell.style.border = 'none';
      leftCell.style.padding = '2px 5px';

      rightCell.style.width = '55%';
      rightCell.style.verticalAlign = 'top';
      rightCell.style.textAlign = 'center';
      rightCell.style.border = 'none';
      rightCell.style.padding = '2px 5px';

      // Ensure National Motto in right cell is styled
      formatNationalMottoCell(rightCell);
      formatAgencyNameCell(leftCell);
    }
    return;
  }

  // If no table exists, try to locate loose elements and assemble them into a header table
  const allParagraphs = Array.from(container.children);
  let upperAgency = '';
  let mainAgency = '';
  let docNumber = '';
  let locationDate = '';
  let foundHeaderNodes: Element[] = [];

  for (let i = 0; i < Math.min(12, allParagraphs.length); i++) {
    const el = allParagraphs[i];
    const text = (el.textContent || '').trim();

    if (text.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') || text.includes('Độc lập - Tự do - Hạnh phúc') || text.includes('Độc lập-Tự do-Hạnh phúc')) {
      foundHeaderNodes.push(el);
      continue;
    }

    if (/^(Hà Nội|TP\.?|Thành phố|Tỉnh|Huyện|Quận|Đà Nẵng|Cần Thơ|Hải Phòng|Hồ Chí Minh).*,?\s*ngày\s*\d+.*tháng\s*\d+.*năm\s*\d+/i.test(text)) {
      locationDate = text;
      foundHeaderNodes.push(el);
      continue;
    }

    if (/^Số\s*:?\s*[\d\w\/\-\.\+]+/i.test(text)) {
      docNumber = text;
      foundHeaderNodes.push(el);
      continue;
    }

    if (/^(BỘ|SỞ|ỦY BÀN|UBND|TỔNG CÔNG TY|CÔNG TY|TRƯỜNG|BỆNH VIỆN|HỘI|NGÂN HÀNG|VIỆN)/i.test(text) && text.length < 100) {
      if (!mainAgency) mainAgency = text;
      else if (!upperAgency) {
        upperAgency = mainAgency;
        mainAgency = text;
      }
      foundHeaderNodes.push(el);
    }
  }

  if (foundHeaderNodes.length >= 2) {
    const tableEl = document.createElement('table');
    tableEl.className = 'gov-header-table';
    tableEl.setAttribute('border', '0');
    tableEl.style.width = '100%';
    tableEl.style.borderCollapse = 'collapse';
    tableEl.style.border = 'none';
    tableEl.style.marginBottom = '18px';

    const dateText = locationDate || '......, ngày ... tháng ... năm 20...';
    const numText = docNumber || 'Số: ...../.....';

    tableEl.innerHTML = `
      <tr>
        <td style="width: 45%; vertical-align: top; text-align: center; border: none; padding: 2px 5px;">
          ${upperAgency ? `<div style="font-size: 11pt; text-transform: uppercase;">${upperAgency}</div>` : ''}
          <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase;">${mainAgency || 'TÊN CƠ QUAN BAN HÀNH'}</div>
          <div style="font-size: 11pt; margin-top: 4px;">${numText}</div>
        </td>
        <td style="width: 55%; vertical-align: top; text-align: center; border: none; padding: 2px 5px;">
          <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style="font-size: 12pt; font-weight: bold; margin-top: 2px;">
            <u style="text-underline-offset: 3px;">Độc lập - Tự do - Hạnh phúc</u>
          </div>
          <div style="font-size: 12pt; font-style: italic; margin-top: 6px;">${dateText}</div>
        </td>
      </tr>
    `;

    // Insert table before the first header node, remove loose header nodes
    const firstNode = foundHeaderNodes[0];
    container.insertBefore(tableEl, firstNode);
    foundHeaderNodes.forEach((node) => node.remove());
  }
}

function formatNationalMottoCell(cell: HTMLElement) {
  let html = cell.innerHTML;
  if (!html.includes('<u>') && html.includes('Độc lập')) {
    html = html.replace(/Độc lập\s*-\s*Tự do\s*-\s*Hạnh phúc/g, '<u>Độc lập - Tự do - Hạnh phúc</u>');
    cell.innerHTML = html;
  }
}

function formatAgencyNameCell(cell: HTMLElement) {
  // Ensure lines inside left header cell have proper styling
  const divs = cell.querySelectorAll('div, p');
  divs.forEach((d) => {
    const el = d as HTMLElement;
    el.style.textAlign = 'center';
    el.style.marginBottom = '2px';
  });
}

/**
 * Formats Document Title (QUYẾT ĐỊNH, THÔNG TƯ, CÔNG VĂN...) & Subject (Về việc...)
 */
function formatDocumentTitleAndSubject(container: HTMLElement) {
  const elements = Array.from(container.querySelectorAll('p, div, h1, h2, h3'));

  elements.forEach((el) => {
    const text = (el.textContent || '').trim();

    // Matching document types
    const titleRegex = /^(QUYẾT ĐỊNH|THÔNG TƯ|CÔNG VĂN|TỜ TRÌNH|BÁO CÁO|THÔNG BÁO|KẾ HOẠCH|NGHỊ QUYẾT|QUY CHẾ|HỢP ĐỒNG|BIÊN BẢN|HƯỚNG DẪN|CÔNG ĐIỆN)$/i;

    if (titleRegex.test(text)) {
      const htmlEl = el as HTMLElement;
      htmlEl.style.textAlign = 'center';
      htmlEl.style.fontWeight = 'bold';
      htmlEl.style.fontSize = '15pt';
      htmlEl.style.textTransform = 'uppercase';
      htmlEl.style.marginTop = '16px';
      htmlEl.style.marginBottom = '6px';
      htmlEl.style.letterSpacing = '0.5px';
    }

    // Matching subject lines ("Về việc...", "v/v...", "V/v...")
    if (/^(Về việc|V\/v|v\/v)\s*:/i.test(text)) {
      const htmlEl = el as HTMLElement;
      htmlEl.style.textAlign = 'center';
      htmlEl.style.fontWeight = 'bold';
      htmlEl.style.fontStyle = 'italic';
      htmlEl.style.fontSize = '13pt';
      htmlEl.style.marginTop = '4px';
      htmlEl.style.marginBottom = '16px';
    }
  });
}

/**
 * Formats Legal Bases ("Căn cứ...")
 */
function formatLegalBases(container: HTMLElement) {
  const paragraphs = Array.from(container.querySelectorAll('p, div'));

  paragraphs.forEach((p) => {
    const text = (p.textContent || '').trim();

    if (/^Căn cứ\s+/i.test(text)) {
      const htmlEl = p as HTMLElement;
      htmlEl.style.fontStyle = 'italic';
      htmlEl.style.textAlign = 'justify';
      htmlEl.style.textIndent = '1.27cm';
      htmlEl.style.marginTop = '2px';
      htmlEl.style.marginBottom = '4px';
    }
  });
}

/**
 * Formats Articles (Điều 1.), Clauses (1., 2.), Points (a, b) and general body text
 */
function formatArticlesAndBody(container: HTMLElement) {
  const paragraphs = Array.from(container.querySelectorAll('p, div'));

  paragraphs.forEach((p) => {
    // Skip if element is inside a table
    if (p.closest('table')) return;

    const text = (p.textContent || '').trim();
    if (!text) return;

    const htmlEl = p as HTMLElement;

    // Matching "Điều 1.", "Điều 2.", "ĐIỀU 1."
    if (/^(Điều|ĐIỀU)\s+\d+[\.\:]/i.test(text)) {
      htmlEl.style.fontWeight = 'normal';
      htmlEl.style.textAlign = 'justify';
      htmlEl.style.textIndent = '1.27cm';
      htmlEl.style.marginTop = '8px';
      htmlEl.style.marginBottom = '6px';

      // Wrap the "Điều X." prefix in bold if not already wrapped
      if (!p.querySelector('b, strong')) {
        p.innerHTML = p.innerHTML.replace(/^((?:Điều|ĐIỀU)\s+\d+[\.\:]?)/i, '<b>$1</b>');
      }
      return;
    }

    // Matching Clauses "1.", "2." or Points "a)", "b)" at start of line
    if (/^(?:\d+[\.\)]|[a-z]\))\s+/i.test(text)) {
      htmlEl.style.textAlign = 'justify';
      htmlEl.style.textIndent = '1.27cm';
      htmlEl.style.marginTop = '4px';
      htmlEl.style.marginBottom = '4px';
      return;
    }

    // General body paragraph formatting (Decree 30: 1.27cm first line indent, justified text)
    if (!p.classList.contains('gov-header-table') && !p.classList.contains('gov-footer-table')) {
      if (!htmlEl.style.textAlign) {
        htmlEl.style.textAlign = 'justify';
      }
      if (!htmlEl.style.textIndent) {
        htmlEl.style.textIndent = '1.27cm';
      }
      if (!htmlEl.style.marginBottom) {
        htmlEl.style.marginBottom = '6pt';
      }
    }
  });
}

/**
 * Ensures Footer is structured as a 2-column borderless table
 * Left: Recipients (Nơi nhận: - Như Điều... - Lưu: VT, ...)
 * Right: Signatory position & Full Name (CHỨC VỤ NGƯỜI KÝ, Họ và tên)
 */
function ensureGovFooterTable(container: HTMLElement) {
  let footerTable = container.querySelector('table.gov-footer-table') as HTMLTableElement | null;

  if (!footerTable) {
    const tables = Array.from(container.querySelectorAll('table'));
    for (const tbl of tables) {
      if (tbl.classList.contains('gov-header-table')) continue;
      const text = tbl.textContent || '';
      if (text.includes('Nơi nhận:') || text.includes('Nơi nhận') || /CHỦ TỊCH|GIÁO ĐỐC|BỘ TRƯỞNG|THỦ TRƯỞNG|HIỆU TRƯỞNG|TRƯỞNG PHÒNG|KT\.|TL\./i.test(text)) {
        footerTable = tbl;
        footerTable.classList.add('gov-footer-table');
        break;
      }
    }
  }

  if (footerTable) {
    footerTable.setAttribute('border', '0');
    footerTable.style.width = '100%';
    footerTable.style.borderCollapse = 'collapse';
    footerTable.style.border = 'none';
    footerTable.style.marginTop = '20px';

    const cells = footerTable.querySelectorAll('td, th');
    if (cells.length >= 2) {
      const leftCell = cells[0] as HTMLElement;
      const rightCell = cells[1] as HTMLElement;

      leftCell.style.width = '45%';
      leftCell.style.verticalAlign = 'top';
      leftCell.style.textAlign = 'left';
      leftCell.style.border = 'none';
      leftCell.style.fontSize = '11pt';

      rightCell.style.width = '55%';
      rightCell.style.verticalAlign = 'top';
      rightCell.style.textAlign = 'center';
      rightCell.style.border = 'none';
      rightCell.style.fontSize = '13pt';

      // Style Recipients (Nơi nhận)
      const recipientTitle = leftCell.querySelector('p, div');
      if (recipientTitle) {
        (recipientTitle as HTMLElement).style.fontWeight = 'bold';
        (recipientTitle as HTMLElement).style.fontStyle = 'italic';
        (recipientTitle as HTMLElement).style.fontSize = '12pt';
      }

      // Style Signatory Title & Name
      const signatoryDivs = Array.from(rightCell.querySelectorAll('p, div'));
      if (signatoryDivs.length > 0) {
        const topTitle = signatoryDivs[0] as HTMLElement;
        topTitle.style.fontWeight = 'bold';
        topTitle.style.textTransform = 'uppercase';
        topTitle.style.textAlign = 'center';

        if (signatoryDivs.length >= 2) {
          const nameEl = signatoryDivs[signatoryDivs.length - 1] as HTMLElement;
          nameEl.style.fontWeight = 'bold';
          nameEl.style.textAlign = 'center';
          nameEl.style.marginTop = '35px'; // Leave space for physical signature / seal
        }
      }
    }
    return;
  }

  // If no table exists, look for loose footer nodes at bottom
  const allChildren = Array.from(container.children);
  let recipientNode: Element | null = null;
  let signatoryTitleNode: Element | null = null;
  let signatoryNameNode: Element | null = null;

  for (let i = allChildren.length - 1; i >= Math.max(0, allChildren.length - 10); i--) {
    const el = allChildren[i];
    const text = (el.textContent || '').trim();

    if (/^Nơi nhận\s*:?/i.test(text)) {
      recipientNode = el;
    }

    if (/^(CHỦ TỊCH|GIÁO ĐỐC|BỘ TRƯỞNG|THỦ TRƯỞNG|HIỆU TRƯỞNG|TRƯỞNG PHÒNG|KT\.|TL\.|KẾ TOÁN TRƯỞNG)/i.test(text)) {
      if (!signatoryTitleNode) signatoryTitleNode = el;
    } else if (signatoryTitleNode && !signatoryNameNode && text.length > 2 && text.length < 50 && !text.includes('Nơi nhận')) {
      signatoryNameNode = el;
    }
  }

  if (recipientNode || signatoryTitleNode) {
    const tableEl = document.createElement('table');
    tableEl.className = 'gov-footer-table';
    tableEl.setAttribute('border', '0');
    tableEl.style.width = '100%';
    tableEl.style.borderCollapse = 'collapse';
    tableEl.style.border = 'none';
    tableEl.style.marginTop = '25px';

    const recipText = recipientNode ? recipientNode.innerHTML : '<b><i>Nơi nhận:</i></b><br/>- Như trên;<br/>- Lưu: VT.';
    const sigTitleText = signatoryTitleNode ? signatoryTitleNode.textContent : '<b>GIÁO ĐỐC</b>';
    const sigNameText = signatoryNameNode ? signatoryNameNode.textContent : '<i>(Ký, ghi rõ họ tên)</i>';

    tableEl.innerHTML = `
      <tr>
        <td style="width: 45%; vertical-align: top; text-align: left; border: none; font-size: 11pt; line-height: 1.3;">
          ${recipText}
        </td>
        <td style="width: 55%; vertical-align: top; text-align: center; border: none; font-size: 13pt;">
          <div style="font-weight: bold; text-transform: uppercase;">${sigTitleText}</div>
          <div style="height: 50px;"></div>
          <div style="font-weight: bold;">${sigNameText}</div>
        </td>
      </tr>
    `;

    if (recipientNode) recipientNode.remove();
    if (signatoryTitleNode) signatoryTitleNode.remove();
    if (signatoryNameNode) signatoryNameNode.remove();

    container.appendChild(tableEl);
  }
}
