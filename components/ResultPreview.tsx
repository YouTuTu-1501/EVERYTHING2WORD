
import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, FileText, Check, Copy, Settings2, ChevronDown, ChevronUp, Type, AlignLeft, List, Archive, Loader2, Layers, FileCheck, Wand2, Sparkles } from 'lucide-react';
import { ConversionResult } from '../types';
import { downloadAsDocx, downloadMergedAsDocx, generateDocxBlob } from '../services/docxService';
import { stripCssAndMetadata } from '../utils/htmlCleaner';
import { autoAlignGovDocument } from '../utils/adminDocAutoAligner';

// Declare JSZip globally
declare const JSZip: any;

interface ResultPreviewProps {
  results: ConversionResult[];
  onReset: () => void;
}

export const ResultPreview: React.FC<ResultPreviewProps> = ({ results, onReset }) => {
  const [alignedResults, setAlignedResults] = useState<ConversionResult[]>(results);
  const [alignedNotify, setAlignedNotify] = useState(false);

  useEffect(() => {
    setAlignedResults(results);
  }, [results]);

  const [viewMode, setViewMode] = useState<'merged' | 'single'>(results.length > 1 ? 'merged' : 'single');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Formatting state
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [lineHeight, setLineHeight] = useState('1.15');
  const [bodyFontSize, setBodyFontSize] = useState('13');
  const [headingFontSize, setHeadingFontSize] = useState('16');
  const [marginPreset, setMarginPreset] = useState<'gov' | 'normal' | 'narrow'>('gov');

  const currentResult = alignedResults[selectedIndex] || results[selectedIndex];

  // Helper to construct merged HTML content from all results
  const getMergedHtmlContent = () => {
    return alignedResults.map((res, idx) => `
      <div class="merged-document-section" id="doc-section-${idx + 1}">
        ${stripCssAndMetadata(res.content)}
      </div>
      ${idx < alignedResults.length - 1 ? '<br style="page-break-before: always; clear: both;" />' : ''}
    `).join('\n');
  };

  const activeContent = stripCssAndMetadata(viewMode === 'merged' ? getMergedHtmlContent() : (currentResult?.content || ''));

  const getExportOptions = () => ({
    fontFamily: fontFamily,
    fontSize: parseInt(bodyFontSize, 10) || 13,
    headingFontSize: parseInt(headingFontSize, 10) || 16,
    lineHeight: parseFloat(lineHeight) || 1.15,
    marginPreset: marginPreset,
  });

  const applyGovPreset = () => {
    setFontFamily('Times New Roman');
    setBodyFontSize('13');
    setHeadingFontSize('16');
    setLineHeight('1.15');
    setMarginPreset('gov');
  };

  const handleAutoAlignGov = () => {
    applyGovPreset();
    const updated = alignedResults.map((res) => ({
      ...res,
      content: autoAlignGovDocument(res.content),
    }));
    setAlignedResults(updated);
    setAlignedNotify(true);
    setTimeout(() => setAlignedNotify(false), 3000);
  };

  const getStyledHtmlForClipboard = (contentHtml: string) => {
    const font = fontFamily || 'Times New Roman';
    const size = bodyFontSize || '13';
    const hSize = headingFontSize || '16';
    const lh = lineHeight || '1.15';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body, div, p, td, th, li, span {
    font-family: '${font}', 'Times New Roman', serif !important;
    font-size: ${size}pt !important;
    line-height: ${lh} !important;
    color: #000000;
  }
  p, div {
    margin-top: 0;
    margin-bottom: 6pt;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: '${font}', 'Times New Roman', serif !important;
    font-weight: bold;
    color: #000000;
    margin-top: 10pt;
    margin-bottom: 4pt;
  }
  h1 { font-size: ${hSize}pt !important; }
  h2 { font-size: ${parseInt(hSize) - 1}pt !important; }
  h3 { font-size: ${parseInt(hSize) - 2}pt !important; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  table:not([border="0"]):not(.gov-header-table):not(.gov-footer-table):not(.borderless) {
    border: 1px solid #000000;
  }
  table:not([border="0"]):not(.gov-header-table):not(.gov-footer-table):not(.borderless) th,
  table:not([border="0"]):not(.gov-header-table):not(.gov-footer-table):not(.borderless) td {
    border: 1px solid #000000 !important;
  }
  table.gov-header-table td, table.gov-footer-table td, table[border="0"] td, table.borderless td {
    border: none !important;
  }
  th, td {
    padding: 3pt 5pt;
    vertical-align: top;
  }
  th {
    background-color: #f3f4f6;
    font-weight: bold;
    text-align: center;
  }
  ul, ol {
    margin-top: 0;
    margin-bottom: 6pt;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 3pt;
  }
</style>
</head>
<body>
${contentHtml}
</body>
</html>`;
  };

  const handleCopy = async () => {
    const styledHtml = getStyledHtmlForClipboard(activeContent);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = activeContent;
    const plainText = tempDiv.innerText;

    if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
      try {
        const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (e) {
        console.warn('ClipboardItem async write failed, using fallback:', e);
      }
    }

    const listener = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/html', styledHtml);
        e.clipboardData.setData('text/plain', plainText);
      }
    };
    document.addEventListener('copy', listener);
    document.execCommand('copy');
    document.removeEventListener('copy', listener);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingleDocx = async (index: number) => {
    const res = alignedResults[index] || results[index];
    if (!res) return;

    setIsDownloading(true);
    try {
      await downloadAsDocx(res.content, res.fileName, getExportOptions());
    } catch (error) {
      console.error("Docx download error:", error);
      alert("Đã xảy ra lỗi khi tạo tệp .docx.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadMergedDocx = async () => {
    setIsDownloading(true);
    try {
      const contents = alignedResults.map(r => r.content);
      await downloadMergedAsDocx(contents, 'Tai_lieu_gop', getExportOptions());
    } catch (error) {
      console.error("Merged docx download error:", error);
      alert("Đã xảy ra lỗi khi tạo tệp .docx gộp.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (typeof JSZip === 'undefined') {
        console.warn("JSZip not loaded, falling back to multiple file downloads.");
        alignedResults.forEach((_, i) => handleDownloadSingleDocx(i));
        return;
    }

    setIsZipping(true);
    try {
        const zip = new JSZip();
        const exportOpts = getExportOptions();
        
        // Thêm từng file docx riêng lẻ vào zip
        for (let i = 0; i < alignedResults.length; i++) {
          const res = alignedResults[i];
          const safeName = res.fileName.replace(/\.[^/.]+$/, "");
          const { blob } = await generateDocxBlob(res.content, { ...exportOpts, title: safeName });
          zip.file(`${safeName}.docx`, blob);
        }

        // Thêm file docx gộp tất cả
        const mergedContents = alignedResults.map(r => r.content);
        const mergedHtml = mergedContents.map((content, idx) => `
          <div class="document-section">${content}</div>
          ${idx < mergedContents.length - 1 ? '<br style="page-break-before: always; clear: both;" />' : ''}
        `).join('\n');

        const { blob: mergedBlob } = await generateDocxBlob(mergedHtml, { ...exportOpts, title: 'TAI_LIEU_GOP_TAT_CA' });
        zip.file(`00_TAI_LIEU_GOP_TAT_CA.docx`, mergedBlob);

        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `converted_documents_docx_${new Date().toISOString().slice(0,10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 300);
    } catch (error) {
        console.error("Zip error:", error);
        alert("Có lỗi khi tạo ZIP .docx. Hệ thống sẽ tải từng tệp.");
        results.forEach((_, i) => handleDownloadSingleDocx(i));
    } finally {
        setIsZipping(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 animate-fade-in-up flex flex-col lg:flex-row gap-6">
      
      {/* Sidebar navigation when there are multiple results */}
      {results.length > 1 && (
        <div className="w-full lg:w-64 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-gray-600 uppercase">Chế độ xem</span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                {results.length} tệp
              </span>
            </div>

            <div className="p-2 space-y-1.5">
              {/* Button xem gộp tất cả */}
              <button
                onClick={() => setViewMode('merged')}
                className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all flex items-center justify-between gap-2 border ${
                  viewMode === 'merged' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                    : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 shrink-0" />
                  <span className="truncate">GỘP TẤT CẢ (1 FILE)</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${viewMode === 'merged' ? 'bg-blue-500 text-white' : 'bg-blue-200 text-blue-900'}`}>
                  Khuyên dùng
                </span>
              </button>

              <div className="pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 border-t border-gray-100">
                Từng tệp riêng lẻ:
              </div>

              <div className="max-h-[40vh] overflow-y-auto space-y-1 custom-scrollbar">
                {results.map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedIndex(idx);
                      setViewMode('single');
                    }}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-center gap-2.5 ${
                      viewMode === 'single' && selectedIndex === idx 
                        ? 'bg-gray-800 text-white font-bold shadow-sm' 
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${viewMode === 'single' && selectedIndex === idx ? 'text-blue-400' : 'text-gray-400'}`} />
                    <span className="truncate">{res.fileName}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Nút tải ZIP dự phòng */}
          <button 
            onClick={handleDownloadAllZip}
            disabled={isZipping}
            className={`w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all border border-gray-200 flex items-center justify-center gap-2 ${isZipping ? 'opacity-70 cursor-wait' : ''}`}
          >
            {isZipping ? <Loader2 className="w-4 h-4 animate-spin text-gray-600" /> : <Archive className="w-4 h-4 text-gray-600" />}
            <span>{isZipping ? 'ĐANG NÉN ZIP...' : 'TẢI TẤT CẢ DẠNG ZIP'}</span>
          </button>
        </div>
      )}

      <div className="flex-grow space-y-4 min-w-0">
        {/* Formatting Options Accordion */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button 
            onClick={() => setIsOptionsOpen(!isOptionsOpen)}
            className="w-full flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-gray-700 font-semibold">
              <Settings2 className="w-4 h-4 text-blue-500" />
              <span className="text-sm">Định dạng file Word xuất ra (Font chữ, Lề trang, Giãn dòng)</span>
            </div>
            {isOptionsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          
          {isOptionsOpen && (
            <div className="p-4 border-t border-gray-100 space-y-4 bg-gray-50/50">
              {/* Quick Preset Button */}
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-900 text-xs">
                  <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <b>Chuẩn NĐ 30/2020/NĐ-CP (Văn bản Hành chính)</b>: Times New Roman 13pt, Giãn dòng 1.15, Lề: Trái 3cm, Phải 1.5cm, Trên 2cm, Dưới 2cm.
                  </span>
                </div>
                <button
                  onClick={applyGovPreset}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 ml-2 shadow-2xs"
                >
                  Áp dụng chuẩn NĐ 30
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Font chữ */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 uppercase">
                    <Type className="w-3.5 h-3.5 text-blue-600" /> Font chữ
                  </label>
                  <select 
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  >
                    <option value="Times New Roman">Times New Roman (Chuẩn VN)</option>
                    <option value="Arial">Arial</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Aptos">Aptos (Word mới)</option>
                  </select>
                </div>

                {/* Căn lề trang */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 uppercase">
                    <AlignLeft className="w-3.5 h-3.5 text-blue-600" /> Căn lề trang (Margins)
                  </label>
                  <select 
                    value={marginPreset}
                    onChange={(e) => setMarginPreset(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  >
                    <option value="gov">Chuẩn Hành chính (3-1.5-2-2cm)</option>
                    <option value="normal">Normal A4 (Đều 2.54cm)</option>
                    <option value="narrow">Narrow Hẹp (Đều 1.27cm)</option>
                  </select>
                </div>

                {/* Giãn dòng */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 uppercase">
                    <List className="w-3.5 h-3.5 text-blue-600" /> Giãn dòng
                  </label>
                  <select 
                    value={lineHeight}
                    onChange={(e) => setLineHeight(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  >
                    <option value="1.0">1.0 (Đơn)</option>
                    <option value="1.15">1.15 lines (Chuẩn NĐ 30)</option>
                    <option value="1.25">1.25 lines</option>
                    <option value="1.5">1.5 lines</option>
                  </select>
                </div>

                {/* Cỡ chữ */}
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between text-xs font-bold text-gray-600 uppercase">
                    <span className="flex items-center gap-1"><Type className="w-3.5 h-3.5 text-blue-600" /> Cỡ chữ</span>
                    <span className="text-blue-600 font-bold">{bodyFontSize}pt</span>
                  </label>
                  <input 
                    type="range" min="11" max="16" step="1"
                    value={bodyFontSize}
                    onChange={(e) => setBodyFontSize(e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-2"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Document Preview Container */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col h-[65vh] min-h-[500px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0 gap-2">
            <div className="flex items-center gap-2 text-gray-800 min-w-0">
              {viewMode === 'merged' ? (
                <>
                  <Layers className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="font-bold text-sm truncate">
                    Xem trước file gộp ({results.length} tệp/ảnh liên tiếp)
                  </span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="font-semibold text-sm truncate">
                    Xem trước: {currentResult?.fileName}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {alignedNotify && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-fade-in flex items-center gap-1 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Đã căn chỉnh NĐ 30/2020!
                </span>
              )}
              <button 
                onClick={handleAutoAlignGov}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                title="Tự động căn chỉnh thể thức văn bản hành chính theo NĐ 30/2020/NĐ-CP (Quốc hiệu, Tiêu ngữ, Căn cứ, Điều/Khoản, Nơi nhận/ký)"
              >
                <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Căn chỉnh NĐ 30</span>
              </button>
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shrink-0 shadow-sm cursor-pointer"
                title="Sao chép toàn bộ văn bản đang xem"
              >
                 {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                 <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
              </button>
            </div>
          </div>
          
          <div className="flex-grow bg-gray-100 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
              <div className="bg-white shadow-md min-h-full p-8 sm:p-12 max-w-[21cm] mx-auto text-gray-900 leading-relaxed font-serif overflow-hidden rounded-sm border border-gray-200">
                  <div 
                    style={{ lineHeight: lineHeight, fontSize: `${bodyFontSize}pt` }}
                    className="prose prose-slate max-w-none prose-p:font-serif prose-p:mb-4 prose-headings:font-bold prose-headings:font-serif prose-headings:text-gray-900"
                    dangerouslySetInnerHTML={{ __html: activeContent }} 
                  />
              </div>
          </div>

          <div className="p-4 sm:p-5 bg-white border-t border-gray-100 flex flex-col sm:flex-row gap-3 items-center justify-between flex-shrink-0">
            <button
              onClick={onReset}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-bold transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Chuyển đổi tệp khác</span>
            </button>
            
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              {results.length > 1 && (
                <button
                  onClick={handleDownloadMergedDocx}
                  disabled={isDownloading}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98] ${isDownloading ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                  <span>{isDownloading ? 'ĐANG TẠO FILE DOCX...' : 'TẢI 1 FILE WORD GỘP (.DOCX)'}</span>
                </button>
              )}

              {viewMode === 'single' && (
                <button
                  onClick={() => handleDownloadSingleDocx(selectedIndex)}
                  disabled={isDownloading}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-gray-800 hover:bg-black text-white rounded-xl text-xs font-bold transition-all ${isDownloading ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{isDownloading ? 'ĐANG ĐÓNG GÓI...' : 'TẢI TỆP NÀY (.DOCX)'}</span>
                </button>
              )}

              {results.length === 1 && (
                <button
                  onClick={() => handleDownloadSingleDocx(0)}
                  disabled={isDownloading}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98] ${isDownloading ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-5 h-5" />}
                  <span>{isDownloading ? 'ĐANG TẠO FILE DOCX...' : 'TẢI XUỐNG WORD (.DOCX)'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

