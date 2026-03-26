
import React, { useState } from 'react';
import { Download, RefreshCw, FileText, Check, Copy, Settings2, ChevronDown, ChevronUp, Type, AlignLeft, List, Archive, Loader2 } from 'lucide-react';
import { ConversionResult } from '../types';

// Declare JSZip globally
declare const JSZip: any;

interface ResultPreviewProps {
  results: ConversionResult[];
  onReset: () => void;
}

export const ResultPreview: React.FC<ResultPreviewProps> = ({ results, onReset }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  
  // Formatting state
  const [lineHeight, setLineHeight] = useState('1.5');
  const [bodyFontSize, setBodyFontSize] = useState('12');
  const [headingFontSize, setHeadingFontSize] = useState('16');

  const currentResult = results[selectedIndex];

  // Helper function to generate Word HTML content
  const generateWordContent = (content: string, fileName: string) => {
    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <title>${fileName}</title>
        <style>
          body { 
            font-family: 'Times New Roman', serif; 
            font-size: ${bodyFontSize}pt; 
            line-height: ${lineHeight};
          }
          table { 
            border-collapse: collapse; 
            width: 100%; 
            margin-bottom: 1em;
            border: 1px solid windowtext;
            mso-border-alt: solid windowtext .5pt;
          }
          td, th { 
            border: 1px solid windowtext; 
            padding: 5px 8px; 
            vertical-align: top;
            mso-border-alt: solid windowtext .5pt;
          }
          th { background-color: #f2f2f2; font-weight: bold; }
          h1 { font-size: ${parseInt(headingFontSize) + 4}pt; font-weight: bold; margin: 12pt 0 6pt 0; }
          h2 { font-size: ${headingFontSize}pt; font-weight: bold; margin: 10pt 0 5pt 0; }
          h3 { font-size: ${parseInt(headingFontSize) - 2}pt; font-weight: bold; margin: 8pt 0 4pt 0; }
          p { margin: 0 0 1em 0; }
          div.img-container { text-align: center; margin: 10px 0; }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  };

  const handleCopy = () => {
    if (!currentResult) return;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentResult.content;
    const text = tempDiv.innerText;
    
    const listener = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/html', currentResult.content);
        e.clipboardData.setData('text/plain', text);
      }
    };
    document.addEventListener('copy', listener);
    document.execCommand('copy');
    document.removeEventListener('copy', listener);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (index: number) => {
    const res = results[index];
    if (!res) return;

    const fileContent = generateWordContent(res.content, res.fileName);

    const blob = new Blob(['\uFEFF', fileContent], {
      type: 'application/msword;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    const safeName = res.fileName.replace(/\.[^/.]+$/, "");
    downloadLink.download = `${safeName}.doc`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleDownloadAll = async () => {
    // If JSZip is not available, fallback to individual downloads
    if (typeof JSZip === 'undefined') {
        console.warn("JSZip not loaded, falling back to multiple file downloads.");
        results.forEach((_, i) => handleDownload(i));
        return;
    }

    setIsZipping(true);
    try {
        const zip = new JSZip();
        
        results.forEach((res) => {
            const content = generateWordContent(res.content, res.fileName);
            const safeName = res.fileName.replace(/\.[^/.]+$/, "");
            zip.file(`${safeName}.doc`, content);
        });

        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `converted_documents_${new Date().toISOString().slice(0,10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
        console.error("Zip error:", error);
        alert("Có lỗi khi nén file. Hệ thống sẽ tải xuống từng file.");
        results.forEach((_, i) => handleDownload(i));
    } finally {
        setIsZipping(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 animate-fade-in-up flex flex-col lg:flex-row gap-6">
      
      {/* Sidebar for multiple files */}
      {results.length > 1 && (
        <div className="w-full lg:w-64 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <List className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-gray-600 uppercase">Danh sách tệp ({results.length})</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {results.map((res, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedIndex(idx)}
                  className={`w-full text-left p-3 rounded-lg text-xs transition-all flex items-center gap-3 ${selectedIndex === idx ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100 shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <FileText className={`w-4 h-4 flex-shrink-0 ${selectedIndex === idx ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="truncate">{res.fileName}</span>
                </button>
              ))}
            </div>
          </div>
          
          <button 
            onClick={handleDownloadAll}
            disabled={isZipping}
            className={`w-full py-3 bg-gray-800 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 ${isZipping ? 'opacity-70 cursor-wait' : ''}`}
          >
            {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            {isZipping ? 'ĐANG NÉN...' : `TẢI ZIP TẤT CẢ (${results.length})`}
          </button>
        </div>
      )}

      <div className="flex-grow space-y-4">
        {/* Formatting Options Accordion */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button 
            onClick={() => setIsOptionsOpen(!isOptionsOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-gray-700 font-semibold">
              <Settings2 className="w-4 h-4 text-blue-500" />
              <span className="text-sm">Tùy chọn định dạng (Formatting Options)</span>
            </div>
            {isOptionsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          
          {isOptionsOpen && (
            <div className="p-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50/50">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase">
                  <AlignLeft className="w-3.5 h-3.5" /> Giãn dòng
                </label>
                <select 
                  value={lineHeight}
                  onChange={(e) => setLineHeight(e.target.value)}
                  className="w-full text-sm p-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="1.0">Đơn (Single)</option>
                  <option value="1.15">1.15 lines</option>
                  <option value="1.5">1.5 lines</option>
                  <option value="2.0">Đôi (Double)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase">
                  <Type className="w-3.5 h-3.5" /> Cỡ chữ nội dung
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="10" max="18" step="1"
                    value={bodyFontSize}
                    onChange={(e) => setBodyFontSize(e.target.value)}
                    className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-xs font-bold text-blue-600 w-8">{bodyFontSize}pt</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase">
                  <Type className="w-3.5 h-3.5" /> Cỡ chữ tiêu đề
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="14" max="24" step="1"
                    value={headingFontSize}
                    onChange={(e) => setHeadingFontSize(e.target.value)}
                    className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-xs font-bold text-blue-600 w-8">{headingFontSize}pt</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col h-[65vh] min-h-[500px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 text-gray-700 overflow-hidden">
              <FileText className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="font-semibold truncate text-sm">Xem trước: {currentResult?.fileName}</span>
            </div>
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
            >
               {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
               {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
          
          <div className="flex-grow bg-gray-100 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
              <div className="bg-white shadow-sm min-h-full p-10 max-w-[21cm] mx-auto text-gray-900 leading-relaxed font-serif overflow-hidden">
                  <div 
                    style={{ lineHeight: lineHeight, fontSize: `${bodyFontSize}pt` }}
                    className="prose prose-slate max-w-none prose-p:font-serif prose-p:mb-4 prose-headings:font-bold prose-headings:font-serif prose-headings:text-gray-900"
                    dangerouslySetInnerHTML={{ __html: currentResult?.content || '' }} 
                  />
              </div>
          </div>

          <div className="p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between flex-shrink-0">
            <button
              onClick={onReset}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Chuyển đổi mới
            </button>
            
            <button
              onClick={() => handleDownload(selectedIndex)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-5 h-5" />
              Tải xuống Word (.doc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
