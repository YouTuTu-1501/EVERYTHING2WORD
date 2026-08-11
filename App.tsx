
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ProcessingView } from './components/ProcessingView';
import { ResultPreview } from './components/ResultPreview';
import { ImageCropper } from './components/ImageCropper';
import { AppStatus, ConversionResult, FileData, CroppedImage, SimilarityLevel, MathFormat, DocumentType, FileProcessingState } from './types';
import { convertDocument } from './services/geminiService';
import { enhanceImageBase64 } from './utils/imagePreprocessor';
import { autoAlignGovDocument } from './utils/adminDocAutoAligner';
import { AlertTriangle, BrainCircuit, Layers, FunctionSquare, Binary, FileStack, X, Play, Trash2, FileText, GraduationCap, CheckCircle2, ClipboardPaste, Plus, ArrowUp, ArrowDown, ArrowUpDown, BookmarkX, Wand2 } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [currentFiles, setCurrentFiles] = useState<FileData[]>([]);
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [fileProgress, setFileProgress] = useState<FileProcessingState[]>([]);
  
  // Sử dụng runId để quản lý phiên xử lý, tránh xung đột khi hủy và chạy lại nhanh
  const activeRunId = useRef<number>(0);
  
  const [docType, setDocType] = useState<DocumentType>('academic');
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(false);
  const [generateSimilar, setGenerateSimilar] = useState<boolean>(false);
  const [similarCount, setSimilarCount] = useState<number>(1);
  const [similarityLevel, setSimilarityLevel] = useState<SimilarityLevel>('numbers');
  const [mathFormat, setMathFormat] = useState<MathFormat>('equation'); // Mặc định là Word Equation
  const [ignorePageNumbers, setIgnorePageNumbers] = useState<boolean>(true); // Mặc định tự động bỏ qua đánh số trang
  const [enableImageEnhancement, setEnableImageEnhancement] = useState<boolean>(true); // Tự động tiền xử lý tăng độ tương phản & làm rõ nét chữ OCR

  const processAllFiles = async (files: FileData[], images: CroppedImage[]) => {
    const runId = Date.now();
    activeRunId.current = runId;
    
    setResults([]);
    const initialProgress: FileProcessingState[] = files.map(f => ({ name: f.name, status: 'waiting' }));
    setFileProgress(initialProgress);

    const fileErrors: { [key: number]: string } = {};

    const conversionPromises = files.map(async (file, index) => {
      // Chỉ cập nhật trạng thái nếu phiên chạy này vẫn còn hiệu lực
      if (activeRunId.current !== runId) return null;

      setFileProgress(prev => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], status: 'processing', errorDetails: undefined };
        return next;
      });

      try {
        // 1. Kiểm tra kích thước tệp (Giới hạn 20MB)
        const MAX_SIZE_MB = 20;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          throw new Error(`Tệp quá nặng (kích thước > ${MAX_SIZE_MB}MB)`);
        }

        // 2. Kiểm tra định dạng tệp hỗ trợ
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const supportedExts = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'docx', 'txt'];
        const isSupported = file.type.startsWith('image/') || 
                            file.type === 'application/pdf' || 
                            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                            supportedExts.includes(ext);

        if (!isSupported) {
          throw new Error(`Lỗi định dạng: .${ext || 'không xác định'} không được hỗ trợ`);
        }

        // 3. Kiểm tra dữ liệu base64 hợp lệ
        if (!file.base64 || file.base64.length < 50) {
          throw new Error('Tệp rỗng hoặc không thể đọc dữ liệu');
        }

        // 4. Tiền xử lý hình ảnh (Tăng độ tương phản, chuyển xám/đen trắng, làm nét) nếu được bật
        let fileToProcess = file;
        if (enableImageEnhancement && file.type.startsWith('image/')) {
          try {
            const enhancedBase64 = await enhanceImageBase64(file.base64, {
              enableEnhancement: true,
              contrast: 35,
              brightness: 10,
              grayscale: true,
              sharpen: true,
            });
            fileToProcess = { ...file, base64: enhancedBase64 };
          } catch (e) {
            console.warn('Lỗi tiền xử lý ảnh, dùng ảnh gốc:', e);
          }
        }

        let imagesToProcess = images;
        if (enableImageEnhancement && images.length > 0) {
          imagesToProcess = await Promise.all(
            images.map(async (img) => {
              try {
                const enhanced = await enhanceImageBase64(img.base64, {
                  enableEnhancement: true,
                  contrast: 30,
                  brightness: 10,
                  sharpen: true,
                });
                return { ...img, base64: enhanced };
              } catch {
                return img;
              }
            })
          );
        }

        const htmlContent = await convertDocument(
          fileToProcess, 
          imagesToProcess, 
          includeSolutions, 
          generateSimilar, 
          similarCount, 
          similarityLevel,
          mathFormat,
          docType,
          ignorePageNumbers
        );

        let finalContent = htmlContent;
        if (docType === 'administrative') {
          finalContent = autoAlignGovDocument(finalContent);
        }

        if (activeRunId.current !== runId) return null;

        setFileProgress(prev => {
          const next = [...prev];
          if (next[index]) next[index] = { ...next[index], status: 'complete' };
          return next;
        });

        return { index, content: finalContent, fileName: file.name };
      } catch (error: any) {
        if (activeRunId.current !== runId) return null;

        const errMessage = error?.message || 'Lỗi không xác định khi chuyển đổi';
        fileErrors[index] = errMessage;
        console.error(`Error processing ${file.name}:`, error);

        setFileProgress(prev => {
          const next = [...prev];
          if (next[index]) {
            next[index] = { 
              ...next[index], 
              status: 'error', 
              errorDetails: errMessage 
            };
          }
          return next;
        });
        return null;
      }
    });

    const finalResults = await Promise.all(conversionPromises);
    
    if (activeRunId.current !== runId) return;

    // Sắp xếp lại danh sách kết quả tuyệt đối theo đúng thứ tự mảng files người dùng đã chọn
    const successfulResults = finalResults
      .filter((r): r is { index: number; content: string; fileName: string } => r !== null)
      .sort((a, b) => a.index - b.index)
      .map(({ content, fileName }) => ({ content, fileName }));
    
    if (successfulResults.length === 0) {
      setStatus(AppStatus.ERROR);
      const summaryList = files.map((f, i) => `• ${f.name}: ${fileErrors[i] || 'Lỗi xử lý'}`).join('\n');
      setErrorMessage(`Không thể chuyển đổi bất kỳ tệp nào. Chi tiết lỗi từng tệp:\n\n${summaryList}`);
    } else {
      setResults(successfulResults);
      setStatus(AppStatus.COMPLETE);
    }
  };

  const handlePasteImages = useCallback(async (imageBlobs: File[]) => {
    if (imageBlobs.length === 0) return;

    const newFilesPromises = imageBlobs.map((blob, idx) => 
      new Promise<FileData>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            name: `pasted-image-${Date.now()}-${idx + 1}.png`,
            size: blob.size,
            type: blob.type || 'image/png',
            base64: e.target?.result as string
          });
        };
        reader.readAsDataURL(blob);
      })
    );

    const newFiles = await Promise.all(newFilesPromises);

    setCurrentFiles(prev => [...prev, ...newFiles]);
    if (status === AppStatus.IDLE) {
      setStatus(AppStatus.READY);
    } else if (status === AppStatus.CROP_SELECT) {
      // Nếu đang trong giao diện cắt ảnh, dán trực tiếp vào giỏ ảnh đã cắt
      const newCrops: CroppedImage[] = newFiles.map((file, idx) => ({
        id: `pasted-${Date.now()}-${idx}`,
        base64: file.base64,
        page: 0
      }));
      setCroppedImages(prev => [...prev, ...newCrops]);
    }
  }, [status]);

  const handleClipboardButtonClick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const imageBlobs: File[] = [];
        for (const item of items) {
          const imgType = item.types.find(t => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            imageBlobs.push(new File([blob], `pasted-${Date.now()}.png`, { type: imgType }));
          }
        }
        if (imageBlobs.length > 0) {
          handlePasteImages(imageBlobs);
          return;
        }
      }
      alert("Hãy nhấn tổ hợp phím Ctrl+V (hoặc Cmd+V) để dán ảnh trực tiếp từ bộ nhớ tạm.");
    } catch {
      alert("Hãy nhấn tổ hợp phím Ctrl+V (hoặc Cmd+V) để dán ảnh trực tiếp từ bộ nhớ tạm.");
    }
  };

  const handleFileSelect = useCallback((files: FileList) => {
    setErrorMessage(null);
    const fileArray = Array.from(files);
    
    const loadFiles = async () => {
      const fileDataPromises = fileArray.map(file => {
        return new Promise<FileData>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              name: file.name,
              size: file.size,
              type: file.type,
              base64: e.target?.result as string
            });
          };
          reader.readAsDataURL(file);
        });
      });

      const loadedFiles = await Promise.all(fileDataPromises);
      setCurrentFiles(prev => [...prev, ...loadedFiles]);
      setStatus(AppStatus.READY);
    };

    loadFiles();
  }, []);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageBlobs: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) imageBlobs.push(blob);
        }
      }

      if (imageBlobs.length > 0) {
        handlePasteImages(imageBlobs);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePasteImages]);

  const handleStartProcessing = () => {
      const hasCroppable = currentFiles.some(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
      
      if (hasCroppable) {
        setStatus(AppStatus.CROP_SELECT);
      } else {
        setStatus(AppStatus.PROCESSING);
        processAllFiles(currentFiles, []);
      }
  };

  const handleReset = () => {
      setStatus(AppStatus.IDLE);
      setCurrentFiles([]);
      setCroppedImages([]);
      setFileProgress([]);
  };

  const handleRemoveFile = (index: number) => {
      const newFiles = [...currentFiles];
      newFiles.splice(index, 1);
      if (newFiles.length === 0) {
          handleReset();
      } else {
          setCurrentFiles(newFiles);
      }
  };

  const handleMoveFileUp = (index: number) => {
    if (index <= 0) return;
    setCurrentFiles(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  const handleMoveFileDown = (index: number) => {
    if (index >= currentFiles.length - 1) return;
    setCurrentFiles(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  const handleSortByName = () => {
    setCurrentFiles(prev => [...prev].slice().sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    ));
  };

  const handleCropComplete = (images: CroppedImage[]) => {
    setCroppedImages(images);
    if (currentFiles.length > 0) {
        setStatus(AppStatus.PROCESSING);
        processAllFiles(currentFiles, images);
    }
  };

  const handleCropCancel = () => {
      // Hủy quá trình cắt ảnh: Quay lại màn hình chọn tệp sẵn sàng (READY) để chỉnh sửa
      setStatus(currentFiles.length > 0 ? AppStatus.READY : AppStatus.IDLE);
  };

  const handleCancelProcess = () => {
    activeRunId.current = 0; // Vô hiệu hóa runId hiện tại
    setStatus(AppStatus.READY);
    setFileProgress([]);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-8 flex flex-col items-center justify-start gap-6 relative">
        
        {(status === AppStatus.IDLE || status === AppStatus.READY) && (
          <div className="text-center max-w-2xl mx-auto mb-2">
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">
              Chuyển đổi <span className="text-blue-600">Đa tệp</span>
            </h2>
            <p className="text-gray-600">Trích xuất văn bản & hỗ trợ Equation/LaTeX cho Microsoft Word.</p>
          </div>
        )}

        {(status === AppStatus.IDLE || status === AppStatus.READY) && (
          <div className="w-full max-w-2xl mx-auto space-y-4">
            
            {/* Tabs chọn loại tài liệu */}
            <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 flex gap-2 shadow-inner">
              <button
                onClick={() => setDocType('academic')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-3 ${
                  docType === 'academic'
                    ? 'bg-white text-blue-700 shadow-md border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                <GraduationCap className={`w-5 h-5 ${docType === 'academic' ? 'text-blue-600' : 'text-slate-400'}`} />
                <div className="text-left">
                  <div className="font-bold text-sm leading-tight">Tài liệu Toán / Học thuật</div>
                  <div className="text-[10px] text-slate-500 font-normal">Công thức, lời giải, bài tập tương tự</div>
                </div>
              </button>

              <button
                onClick={() => setDocType('administrative')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-3 ${
                  docType === 'administrative'
                    ? 'bg-white text-emerald-700 shadow-md border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                <FileText className={`w-5 h-5 ${docType === 'administrative' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div className="text-left">
                  <div className="font-bold text-sm leading-tight">Văn bản Hành chính</div>
                  <div className="text-[10px] text-slate-500 font-normal">Công văn, quyết định, thể thức Word</div>
                </div>
              </button>
            </div>

            {/* Options Panel */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4 animate-fade-in-up">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Tùy chọn tiền xử lý nâng cao chất lượng ảnh OCR */}
                <div 
                  className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${enableImageEnhancement ? 'bg-indigo-50/90 border-indigo-200 shadow-2xs' : 'bg-white border-gray-100 hover:border-gray-200'}`} 
                  onClick={() => setEnableImageEnhancement(!enableImageEnhancement)}
                >
                  <div className="flex items-center gap-3">
                    <Wand2 className={`w-5 h-5 shrink-0 ${enableImageEnhancement ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-gray-900 text-xs sm:text-sm">Tiền xử lý ảnh OCR nâng cao</h4>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">Tăng tương phản & Làm nét</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">Tự động cân chỉnh độ sáng, tăng độ tương phản và lọc nhiễu các ảnh mờ, scan kém chất lượng trước khi nhận diện.</p>
                    </div>
                  </div>
                  <div className={`h-5 w-9 rounded-full relative transition-colors shrink-0 ml-2 ${enableImageEnhancement ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                    <span className={`absolute top-1 left-1 h-3 w-3 rounded-full bg-white transition-transform ${enableImageEnhancement ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                {/* Tùy chọn bỏ qua số trang chung cho cả 2 loại tài liệu */}
                <div 
                  className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${ignorePageNumbers ? 'bg-amber-50/90 border-amber-200 shadow-2xs' : 'bg-white border-gray-100 hover:border-gray-200'}`} 
                  onClick={() => setIgnorePageNumbers(!ignorePageNumbers)}
                >
                  <div className="flex items-center gap-3">
                    <BookmarkX className={`w-5 h-5 shrink-0 ${ignorePageNumbers ? 'text-amber-600' : 'text-gray-400'}`} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-gray-900 text-xs sm:text-sm">Bỏ qua đánh số trang</h4>
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">Bỏ Header / Footer</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">Lọc bỏ chỉ số trang (Trang 1, Page 2, - 3 -...) để liền mạch văn bản khi gộp nhiều trang thành 1 file Word.</p>
                    </div>
                  </div>
                  <div className={`h-5 w-9 rounded-full relative transition-colors shrink-0 ml-2 ${ignorePageNumbers ? 'bg-amber-600' : 'bg-gray-200'}`}>
                    <span className={`absolute top-1 left-1 h-3 w-3 rounded-full bg-white transition-transform ${ignorePageNumbers ? 'translate-x-4' : ''}`} />
                  </div>
                </div>
              </div>

              {docType === 'administrative' ? (
                /* Giao diện hướng dẫn cho Văn bản Hành chính */
                <div className="bg-emerald-50/80 border border-emerald-200/80 p-4 rounded-xl flex items-start gap-3">
                  <FileText className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950 space-y-1.5">
                    <p className="font-bold text-sm text-emerald-900">
                      Chế độ Chuyển đổi Văn bản Hành chính (Công văn, Quyết định, Hợp đồng...)
                    </p>
                    <p className="text-emerald-800 leading-relaxed">
                      • Tối ưu trích xuất 100% nội dung văn bản thuần, bảng biểu sạch và định dạng văn bản Word chuẩn.<br />
                      • Tự động căn chỉnh thể thức văn bản hành chính Việt Nam (Quốc hiệu, Tiêu ngữ, Căn cứ pháp lý, Điều/Khoản, Nơi nhận và Nơi ký).<br />
                      • Tự động bỏ qua các quy tắc chèn ký hiệu công thức toán phức tạp không cần thiết.
                    </p>
                  </div>
                </div>
              ) : (
                /* Giao diện tùy chọn cho Tài liệu Học thuật / Toán */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${includeSolutions ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`} onClick={() => setIncludeSolutions(!includeSolutions)}>
                      <div className="flex items-center gap-3">
                        <BrainCircuit className={`w-5 h-5 ${includeSolutions ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">Giải toán chi tiết</h4>
                          <p className="text-[10px] text-gray-500">Lời giải từng bước bằng AI.</p>
                        </div>
                      </div>
                      <div className={`h-5 w-9 rounded-full relative transition-colors ${includeSolutions ? 'bg-blue-600' : 'bg-gray-200'}`}>
                        <span className={`absolute top-1 left-1 h-3 w-3 rounded-full bg-white transition-transform ${includeSolutions ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${generateSimilar ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`} onClick={() => setGenerateSimilar(!generateSimilar)}>
                      <div className="flex items-center gap-3">
                        <Layers className={`w-5 h-5 ${generateSimilar ? 'text-indigo-600' : 'text-gray-400'}`} />
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">Bài tập tương tự</h4>
                          <p className="text-[10px] text-gray-500">Mỗi câu gốc tạo N câu mới.</p>
                        </div>
                      </div>
                      <div className={`h-5 w-9 rounded-full relative transition-colors ${generateSimilar ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                        <span className={`absolute top-1 left-1 h-3 w-3 rounded-full bg-white transition-transform ${generateSimilar ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Định dạng Công thức (Mặc định: Word Equation)</label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                      <button 
                        onClick={() => setMathFormat('equation')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold transition-all ${mathFormat === 'equation' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        <FunctionSquare className="w-4 h-4" />
                        Word Equation (Mặc định)
                      </button>
                      <button 
                        onClick={() => setMathFormat('latex')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold transition-all ${mathFormat === 'latex' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        <Binary className="w-4 h-4" />
                        LaTeX ($...$)
                      </button>
                    </div>
                  </div>

                  {generateSimilar && (
                    <div className="pt-4 border-t border-gray-100 animate-fade-in space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-600">Số bài mới cho mỗi câu gốc: {similarCount}</label>
                          <input type="range" min="1" max="5" value={similarCount} onChange={(e) => setSimilarCount(parseInt(e.target.value))} className="w-full accent-indigo-600" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-600">Mức độ tương đồng:</label>
                          <div className="flex bg-gray-100 p-1 rounded-md text-[10px]">
                            <button onClick={() => setSimilarityLevel('numbers')} className={`flex-1 py-1 rounded ${similarityLevel === 'numbers' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-gray-400'}`}>Chỉ đổi số</button>
                            <button onClick={() => setSimilarityLevel('type')} className={`flex-1 py-1 rounded ${similarityLevel === 'type' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-gray-400'}`}>Dạng bài</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {status === AppStatus.IDLE && (
                <FileUpload onFileSelect={handleFileSelect} disabled={false} />
            )}

            {status === AppStatus.READY && (
                <div className="animate-fade-in space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <FileStack className="w-5 h-5 text-blue-600" />
                                <span className="font-bold text-gray-700 text-sm">Tệp đã chọn ({currentFiles.length})</span>
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Thứ tự gộp Word</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {currentFiles.length > 1 && (
                                    <button 
                                        onClick={handleSortByName}
                                        className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                                        title="Sắp xếp tự động theo tên A-Z"
                                    >
                                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" />
                                        <span>Sắp xếp A-Z</span>
                                    </button>
                                )}
                                <button 
                                    onClick={handleClipboardButtonClick}
                                    className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5"
                                    title="Dán thêm ảnh từ Clipboard (Ctrl+V)"
                                >
                                    <ClipboardPaste className="w-3.5 h-3.5" />
                                    <span>Dán ảnh (Ctrl+V)</span>
                                </button>
                                <button 
                                    onClick={() => document.getElementById('add-more-files-input')?.click()}
                                    className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Thêm tệp</span>
                                </button>
                                <input 
                                    id="add-more-files-input" 
                                    type="file" 
                                    accept=".pdf,.docx,.txt,.rtf,image/*" 
                                    multiple 
                                    className="hidden" 
                                    onChange={(e) => e.target.files && handleFileSelect(e.target.files)} 
                                />
                            </div>
                        </div>
                        {currentFiles.length > 1 && (
                            <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between text-xs text-blue-800">
                                <div className="flex items-center gap-2">
                                    <FileStack className="w-4 h-4 text-blue-600 shrink-0" />
                                    <span>Tự động gộp <b>{currentFiles.length} tệp</b> theo đúng thứ tự (1 ➔ {currentFiles.length}) bên dưới thành <b>1 file Word duy nhất</b>. Bấm nút mũi tên <b>↑ ↓</b> để điều chỉnh thứ tự gộp.</span>
                                </div>
                            </div>
                        )}
                        <div className="max-h-64 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {currentFiles.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-white rounded-lg border border-gray-200 transition-all shadow-2xs group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-black flex items-center justify-center shrink-0 border border-blue-200">
                                            {idx + 1}
                                        </span>
                                        <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {file.type.startsWith('image/') ? (
                                                <img src={file.base64} className="w-full h-full object-cover rounded" alt={file.name} />
                                            ) : (
                                                <span className="text-[10px] font-bold text-gray-500">{file.name.split('.').pop()?.toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="truncate">
                                            <div className="text-xs font-bold text-gray-800 truncate">{file.name}</div>
                                            <div className="text-[10px] text-gray-400">{(file.size / 1024).toFixed(1)} KB</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button 
                                            onClick={() => handleMoveFileUp(idx)}
                                            disabled={idx === 0}
                                            className={`p-1.5 rounded-md transition-colors ${idx === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200'}`}
                                            title="Di chuyển lên (Gộp trước)"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleMoveFileDown(idx)}
                                            disabled={idx === currentFiles.length - 1}
                                            className={`p-1.5 rounded-md transition-colors ${idx === currentFiles.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200'}`}
                                            title="Di chuyển xuống (Gộp sau)"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleRemoveFile(idx)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors ml-1"
                                            title="Xóa tệp khỏi danh sách"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleReset}
                            className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Hủy bỏ
                        </button>
                        <button 
                            onClick={handleStartProcessing}
                            className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Bắt đầu xử lý
                        </button>
                    </div>
                </div>
            )}
          </div>
        )}

        {status === AppStatus.CROP_SELECT && currentFiles.length > 0 && (
            <ImageCropper 
              files={currentFiles} 
              externalCrops={croppedImages}
              onComplete={handleCropComplete} 
              onCancel={handleCropCancel} 
            />
        )}

        {(status === AppStatus.PROCESSING) && (
          <ProcessingView files={fileProgress} isComplete={false} onCancel={handleCancelProcess} />
        )}

        {status === AppStatus.COMPLETE && results.length > 0 && (
          <ResultPreview results={results} onReset={handleReset} />
        )}

        {status === AppStatus.ERROR && (
          <div className="bg-white rounded-xl shadow-lg border border-red-100 p-8 text-center max-w-md mx-auto animate-fade-in">
             <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
             <h3 className="text-lg font-bold text-gray-900">Lỗi xử lý</h3>
             <p className="text-gray-600 mt-2 mb-6">{errorMessage}</p>
             <button onClick={() => setStatus(AppStatus.READY)} className="px-8 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors">Quay lại</button>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-gray-200 bg-white mt-auto text-center text-xs text-gray-400">
        © {new Date().getFullYear()} AI Document Hub. Multi-file Processing Enabled.
      </footer>
    </div>
  );
};

export default App;
