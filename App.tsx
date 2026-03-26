
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ProcessingView } from './components/ProcessingView';
import { ResultPreview } from './components/ResultPreview';
import { ImageCropper } from './components/ImageCropper';
import { AppStatus, ConversionResult, FileData, CroppedImage, SimilarityLevel, MathFormat } from './types';
import { convertDocument } from './services/geminiService';
import { AlertTriangle, BrainCircuit, Layers, FunctionSquare, Binary, FileStack, X, Play, Trash2 } from 'lucide-react';

interface FileProcessingState {
  name: string;
  status: 'waiting' | 'processing' | 'complete' | 'error';
}

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [currentFiles, setCurrentFiles] = useState<FileData[]>([]);
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [fileProgress, setFileProgress] = useState<FileProcessingState[]>([]);
  
  // Sử dụng runId để quản lý phiên xử lý, tránh xung đột khi hủy và chạy lại nhanh
  const activeRunId = useRef<number>(0);
  
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(false);
  const [generateSimilar, setGenerateSimilar] = useState<boolean>(false);
  const [similarCount, setSimilarCount] = useState<number>(1);
  const [similarityLevel, setSimilarityLevel] = useState<SimilarityLevel>('numbers');
  const [mathFormat, setMathFormat] = useState<MathFormat>('latex');

  const processAllFiles = async (files: FileData[], images: CroppedImage[]) => {
    const runId = Date.now();
    activeRunId.current = runId;
    
    setResults([]);
    setFileProgress(files.map(f => ({ name: f.name, status: 'waiting' })));

    const conversionPromises = files.map(async (file, index) => {
      // Chỉ cập nhật trạng thái nếu phiên chạy này vẫn còn hiệu lực
      if (activeRunId.current !== runId) return null;

      setFileProgress(prev => {
        const next = [...prev];
        if (next[index]) next[index].status = 'processing';
        return next;
      });

      try {
        const htmlContent = await convertDocument(
          file, 
          // Gửi toàn bộ ảnh đã cắt cho từng file, AI sẽ tự tìm ảnh phù hợp với nội dung
          images, 
          includeSolutions, 
          generateSimilar, 
          similarCount, 
          similarityLevel,
          mathFormat
        );

        if (activeRunId.current !== runId) return null;

        setFileProgress(prev => {
          const next = [...prev];
          if (next[index]) next[index].status = 'complete';
          return next;
        });

        return { content: htmlContent, fileName: file.name };
      } catch (error) {
        if (activeRunId.current !== runId) return null;

        console.error(`Error processing ${file.name}:`, error);
        setFileProgress(prev => {
          const next = [...prev];
          if (next[index]) next[index].status = 'error';
          return next;
        });
        return null;
      }
    });

    const finalResults = await Promise.all(conversionPromises);
    
    if (activeRunId.current !== runId) return;

    const successfulResults = finalResults.filter((r): r is ConversionResult => r !== null);
    
    if (successfulResults.length === 0) {
      setStatus(AppStatus.ERROR);
      setErrorMessage("Không thể chuyển đổi bất kỳ tệp nào. Vui lòng kiểm tra lại tệp đầu vào.");
    } else {
      setResults(successfulResults);
      setStatus(AppStatus.COMPLETE);
    }
  };

  const handleFileSelect = useCallback((files: FileList) => {
    setErrorMessage(null);
    setCroppedImages([]);
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
      setCurrentFiles(loadedFiles);
      setStatus(AppStatus.READY); // Chuyển sang trạng thái READY
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

      if (imageBlobs.length === 0) return;

      const blobToCrop = (blob: File, index: number): Promise<CroppedImage> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              id: `pasted-${Date.now()}-${index}`,
              base64: e.target?.result as string,
              page: 0
            });
          };
          reader.readAsDataURL(blob);
        });
      };

      if (status === AppStatus.IDLE) {
        const firstBlob = imageBlobs[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          const fileData: FileData = {
            name: `pasted-images-${Date.now()}.png`,
            size: firstBlob.size,
            type: firstBlob.type,
            base64: base64
          };
          setCurrentFiles([fileData]);
          
          const newCrops = await Promise.all(imageBlobs.map((blob, idx) => blobToCrop(blob, idx)));
          setCroppedImages(newCrops);
          setStatus(AppStatus.CROP_SELECT);
        };
        reader.readAsDataURL(firstBlob);
      } else if (status === AppStatus.CROP_SELECT) {
        const newCrops = await Promise.all(imageBlobs.map((blob, idx) => blobToCrop(blob, idx)));
        setCroppedImages(prev => [...prev, ...newCrops]);
      } else if (status === AppStatus.READY) {
          const newFilesPromises = imageBlobs.map(blob => new Promise<FileData>((resolve) => {
             const reader = new FileReader();
             reader.onload = (e) => resolve({
                 name: `pasted-${Date.now()}.png`,
                 size: blob.size,
                 type: blob.type,
                 base64: e.target?.result as string
             });
             reader.readAsDataURL(blob);
          }));
          const newFiles = await Promise.all(newFilesPromises);
          setCurrentFiles(prev => [...prev, ...newFiles]);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [status]);

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

  const handleCropComplete = (images: CroppedImage[]) => {
    setCroppedImages(images);
    if (currentFiles.length > 0) {
        setStatus(AppStatus.PROCESSING);
        processAllFiles(currentFiles, images);
    }
  };

  const handleCropCancel = () => {
      if (currentFiles.length > 0) {
          setStatus(AppStatus.PROCESSING);
          processAllFiles(currentFiles, []);
      }
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
            
            {/* Options Panel */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-5 animate-fade-in-up">
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
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Định dạng Công thức</label>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                  <button 
                    onClick={() => setMathFormat('latex')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold transition-all ${mathFormat === 'latex' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <Binary className="w-4 h-4" />
                    LaTeX ($...$)
                  </button>
                  <button 
                    onClick={() => setMathFormat('equation')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold transition-all ${mathFormat === 'equation' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <FunctionSquare className="w-4 h-4" />
                    Word Equation
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
            </div>

            {status === AppStatus.IDLE && (
                <FileUpload onFileSelect={handleFileSelect} disabled={false} />
            )}

            {status === AppStatus.READY && (
                <div className="animate-fade-in space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileStack className="w-5 h-5 text-blue-600" />
                                <span className="font-bold text-gray-700 text-sm">Tệp đã chọn ({currentFiles.length})</span>
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {currentFiles.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                                            {file.type.startsWith('image/') ? (
                                                <img src={file.base64} className="w-full h-full object-cover rounded" />
                                            ) : (
                                                <span className="text-[10px] font-bold text-gray-500">{file.name.split('.').pop()?.toUpperCase()}</span>
                                            )}
                                        </div>
                                        <span className="text-sm text-gray-600 truncate">{file.name}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveFile(idx)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
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
