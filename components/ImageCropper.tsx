
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Crop, Check, X, Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, Trash2, Files } from 'lucide-react';
import { CroppedImage, FileData } from '../types';

interface ImageCropperProps {
  files: FileData[];
  externalCrops?: CroppedImage[];
  onComplete: (images: CroppedImage[]) => void;
  onCancel: () => void;
}

const RESOLUTION_FACTOR = 4;

export const ImageCropper: React.FC<ImageCropperProps> = ({ files, externalCrops = [], onComplete, onCancel }) => {
  // Lọc các tệp có thể cắt được
  const croppableFiles = useMemo(() => 
    files.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/')),
    [files]
  );

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const currentFile = croppableFiles[activeFileIndex];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [loading, setLoading] = useState(true);

  const isPdf = currentFile?.type === 'application/pdf';

  // Đồng bộ ảnh đã cắt từ paste hoặc ban đầu
  useEffect(() => {
    if (externalCrops.length > 0) {
      setCroppedImages(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newOnes = externalCrops.filter(c => !existingIds.has(c.id));
        return [...prev, ...newOnes];
      });
    }
  }, [externalCrops]);

  // Reset tài liệu khi đổi tệp
  useEffect(() => {
    const loadContent = async () => {
      if (!currentFile) return;
      setLoading(true);
      setPdfDoc(null);
      setImageObj(null);
      setPageNum(1);
      
      try {
        if (isPdf) {
          const loadingTask = (window as any).pdfjsLib.getDocument(currentFile.base64);
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
        } else if (currentFile.type.startsWith('image/')) {
          const img = new Image();
          img.onload = () => {
            setImageObj(img);
            setLoading(false);
          };
          img.src = currentFile.base64;
        }
        if (isPdf) setLoading(false);
      } catch (error) {
        console.error("Error loading file in cropper:", error);
        setLoading(false);
      }
    };
    loadContent();
  }, [currentFile, isPdf]);

  // Vẽ nội dung lên canvas
  useEffect(() => {
    if ((!pdfDoc && !imageObj) || !canvasRef.current) return;
    const render = async () => {
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      if (isPdf && pdfDoc) {
        const page = await pdfDoc.getPage(pageNum);
        const highResViewport = page.getViewport({ scale: scale * RESOLUTION_FACTOR });
        canvas.height = highResViewport.height;
        canvas.width = highResViewport.width;
        canvas.style.width = `${highResViewport.width / RESOLUTION_FACTOR}px`;
        canvas.style.height = `${highResViewport.height / RESOLUTION_FACTOR}px`;
        await page.render({ canvasContext: context, viewport: highResViewport }).promise;
      } else if (imageObj) {
        const renderWidth = imageObj.width * scale * RESOLUTION_FACTOR;
        const renderHeight = imageObj.height * scale * RESOLUTION_FACTOR;
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        canvas.style.width = `${renderWidth / RESOLUTION_FACTOR}px`;
        canvas.style.height = `${renderHeight / RESOLUTION_FACTOR}px`;
        context.drawImage(imageObj, 0, 0, renderWidth, renderHeight);
      }
    };
    render();
  }, [pdfDoc, imageObj, pageNum, scale, isPdf]);

  const getCoordinates = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDrawing(true);
    const pos = getCoordinates(e);
    setStartPos(pos);
    setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getCoordinates(e);
    setSelection({
      x: Math.min(pos.x, startPos.x),
      y: Math.min(pos.y, startPos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y)
    });
  };

  const saveCrop = () => {
    if (!selection || !canvasRef.current || selection.w < 5) return;
    const sourceCanvas = canvasRef.current;
    const sourceX = selection.x * RESOLUTION_FACTOR;
    const sourceY = selection.y * RESOLUTION_FACTOR;
    const sourceW = selection.w * RESOLUTION_FACTOR;
    const sourceH = selection.h * RESOLUTION_FACTOR;
    const destCanvas = document.createElement('canvas');
    destCanvas.width = sourceW;
    destCanvas.height = sourceH;
    const ctx = destCanvas.getContext('2d')!;
    ctx.drawImage(sourceCanvas, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
    setCroppedImages([...croppedImages, { id: Date.now().toString(), base64: destCanvas.toDataURL('image/png'), page: pageNum }]);
    setSelection(null);
  };

  // Keydown event listener for Escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  if (loading && !pdfDoc && !imageObj) return <div className="fixed inset-0 bg-white flex items-center justify-center z-[100]"><p className="font-bold text-blue-600 animate-pulse">Đang tải tài liệu...</p></div>;

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 fixed inset-0 z-50 md:relative md:h-[80vh] border border-gray-200 shadow-2xl rounded-xl overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between z-10 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Nút Hủy cắt ảnh */}
          <button 
            onClick={onCancel}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border border-gray-200 shrink-0"
            title="Hủy cắt ảnh và quay lại danh sách tệp (Phím Esc)"
          >
            <X className="w-4 h-4 text-gray-500" />
            <span>HỦY CẮT</span>
          </button>

          {isPdf && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1} className="p-1 disabled:opacity-30"><ChevronLeft className="w-5 h-5"/></button>
              <span className="text-xs font-bold w-12 text-center">{pageNum}/{pdfDoc?.numPages}</span>
              <button onClick={() => setPageNum(p => Math.min(pdfDoc?.numPages, p + 1))} disabled={pageNum >= pdfDoc?.numPages} className="p-1 disabled:opacity-30"><ChevronRight className="w-5 h-5"/></button>
            </div>
          )}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setScale(s => Math.max(0.3, s - 0.2))} className="p-1"><ZoomOut className="w-4 h-4"/></button>
            <span className="text-xs font-bold w-10 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1"><ZoomIn className="w-4 h-4"/></button>
          </div>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-100 text-[10px] font-bold uppercase tracking-wide">
            <MousePointer2 className="w-3 h-3" />
            Kéo chuột để cắt hoặc Ctrl+V để dán thêm ảnh
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if(window.confirm("Bạn có chắc chắn muốn xóa toàn bộ ảnh đã cắt?")) {
                  setCroppedImages([]);
                }
              }} 
              className="px-2.5 py-1.5 text-xs font-bold text-gray-400 hover:text-red-600 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">XÓA HẾT</span>
            </button>
            <button onClick={() => onComplete(croppedImages)} className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shrink-0">
                <Check className="w-4 h-4" /> BẮT ĐẦU CHUYỂN ĐỔI ({croppedImages.length} ẢNH)
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Source Files List */}
        {croppableFiles.length > 1 && (
          <div className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Files className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">NGUỒN CẮT ẢNH</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {croppableFiles.map((f, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`w-full text-left p-3 rounded-lg text-xs transition-all flex items-center gap-3 ${activeFileIndex === idx ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 overflow-auto p-8 bg-gray-200 flex justify-center relative">
          <div className="relative shadow-2xl h-fit">
            <canvas 
              ref={canvasRef} 
              onMouseDown={handleMouseDown} 
              onMouseMove={handleMouseMove} 
              onMouseUp={() => setIsDrawing(false)} 
              className="cursor-crosshair bg-white transition-opacity duration-300" 
              style={{ opacity: loading ? 0.5 : 1 }}
            />
            {selection && <div className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none" style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }} />}
            {selection && selection.w > 10 && !isDrawing && (
              <button 
                onClick={saveCrop} 
                className="absolute z-20 bg-blue-600 text-white p-2 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all" 
                style={{ left: selection.x + selection.w - 15, top: selection.y + selection.h - 15 }}
              >
                <Crop className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right Sidebar: Selected Images List */}
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col shrink-0">
           <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
               <ImageIcon className="w-3 h-3" /> GIỎ ẢNH ({croppedImages.length})
             </h3>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {croppedImages.length === 0 ? (
                  <div className="text-center text-gray-200 py-20">
                    <Crop className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-[10px] uppercase font-bold tracking-wider">Chưa có ảnh</p>
                  </div>
              ) : (
                  [...croppedImages].reverse().map((img, idx) => (
                      <div key={img.id} className="relative group bg-white rounded border border-gray-200 p-1 shadow-sm overflow-hidden animate-scale-up">
                          <img src={img.base64} className="w-full h-auto max-h-32 object-contain bg-gray-50 rounded" />
                          <div className="mt-1 flex justify-between items-center px-1 py-1 bg-gray-50 border-t border-gray-100">
                              <span className="text-[9px] font-bold text-gray-400"># {croppedImages.length - idx}</span>
                              <button 
                                onClick={() => setCroppedImages(croppedImages.filter(c => c.id !== img.id))} 
                                className="flex items-center gap-1 text-[9px] font-bold text-red-400 hover:text-red-600 transition-colors"
                              >
                                <X className="w-2.5 h-2.5" />
                                XÓA
                              </button>
                          </div>
                          {img.page === 0 && <span className="absolute top-1 right-1 bg-amber-500 text-white text-[7px] px-1 rounded shadow-sm font-bold">PASTED</span>}
                      </div>
                  ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
