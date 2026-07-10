"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Video = {
  id: string;
  created_at: string;
  title: string;
  author_name: string;
  youtube_url: string;
  category: string;
};

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Custom Form States
  const [authorName, setAuthorName] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // FFmpeg WebAssembly compression states
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const getVideoId = (url: string) => {
    let videoId = "";
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (url.includes("v=")) {
      videoId = url.split("v=")[1]?.split("&")[0];
    }
    return videoId;
  };

  const fetchVideos = useCallback(async () => {
    setIsRefreshing(true);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setIsLoading(false);
      setIsRefreshing(false);
      return [];
    }
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });

    let validVideos: Video[] = [];
    if (error) {
      console.error("Error fetching videos:", error);
    } else if (data) {
      // Filter out invalid/test entries (empty or missing youtube ID)
      validVideos = data.filter(
        (v) =>
          v.youtube_url &&
          v.youtube_url.length > 20 &&
          v.youtube_url !== "https://youtu.be/" &&
          v.title &&
          v.title.trim() !== ""
      );
      setVideos(validVideos);
    }
    setIsLoading(false);
    setIsRefreshing(false);
    return validVideos;
  }, []);

  // Initial fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVideos();
  }, [fetchVideos]);

  const handleUploadSuccess = useCallback(() => {
    setIsModalOpen(false);
    setUploadSuccess(true);
    setIsPolling(true);

    const startCount = videos.length;

    // Poll for new video every 10 seconds, up to 5 minutes (30 attempts)
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      const currentVideos = await fetchVideos();
      
      // Stop polling early if we detect a new video in the database
      if (currentVideos.length > startCount) {
        clearInterval(interval);
        setIsPolling(false);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setIsPolling(false);
      }
    }, 10000);
  }, [fetchVideos, videos.length]);

  // Listen for Tally form submission
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (_e) {
          // not JSON
        }
      }
      
      const isSubmitted = 
        payload?.event === "Tally.FormSubmitted" ||
        (typeof event.data === "string" && event.data.includes("Tally.FormSubmitted"));

      if (isSubmitted) {
        handleUploadSuccess();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleUploadSuccess]);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      setCompressionProgress(Math.round(progress * 100));
    });
    
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (uploading) return;

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('video/'));
    if (files.length > 0) {
      const validFiles = files.filter(file => file.size <= 300 * 1024 * 1024);
      if (validFiles.length < files.length) {
         setErrorMsg("Alguns arquivos excedem o limite de 300 MB e foram ignorados.");
      } else {
         setErrorMsg(null);
      }
      setVideoFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => file.size <= 300 * 1024 * 1024);
    if (validFiles.length < files.length) {
       setErrorMsg("Alguns arquivos excedem o limite de 300 MB e foram ignorados.");
    } else {
       setErrorMsg(null);
    }
    setVideoFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (indexToRemove: number) => {
    setVideoFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const compressVideo = async (file: File): Promise<Blob> => {
    const ffmpeg = await loadFFmpeg();
    await ffmpeg.writeFile("input.mp4", await fetchFile(file));
    
    // We compress to standard H.264 MP4 with max width 1280px (720p HD)
    // preset superfast is a good compromise between speed and compression ratio
    // crf 28 is safe and keeps files small
    await ffmpeg.exec([
      "-i", "input.mp4",
      "-vf", "scale=w='min(1280,iw)':h=-2",
      "-vcodec", "libx264",
      "-crf", "28",
      "-preset", "superfast",
      "output.mp4"
    ]);
    
    const data = await ffmpeg.readFile("output.mp4");
    
    try {
      await ffmpeg.deleteFile("input.mp4");
      await ffmpeg.deleteFile("output.mp4");
    } catch (e) {
      console.error("Cleanup error in virtual FS:", e);
    }
    
    return new Blob([data as Uint8Array], { type: "video/mp4" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (videoFiles.length === 0 || !authorName.trim() || !videoTitle.trim()) {
      setErrorMsg("Por favor, preencha todos os campos e adicione pelo menos um vídeo.");
      return;
    }

    setUploading(true);
    setErrorMsg(null);

    // Process each file sequentially
    for (let i = 0; i < videoFiles.length; i++) {
      setCurrentUploadIndex(i);
      setUploadProgress(0);
      setCompressionProgress(0);
      
      const currentFile = videoFiles[i];
      let fileToUpload: Blob = currentFile;
      let fileType = currentFile.type;

      setCompressing(true);
      try {
        fileToUpload = await compressVideo(currentFile);
        fileType = "video/mp4";
      } catch (err) {
        console.error(`FFmpeg compression failed for file ${i + 1}`, err);
        fileToUpload = currentFile;
        if (currentFile.size > 50 * 1024 * 1024) {
          setErrorMsg(`A compactação falhou e o vídeo ${i + 1} original excede 50 MB. Cancelando os envios restantes.`);
          setUploading(false);
          setCompressing(false);
          return;
        }
      } finally {
        setCompressing(false);
      }

      if (fileToUpload.size > 50 * 1024 * 1024) {
        setErrorMsg(`O vídeo ${i + 1} (mesmo compactado) ficou com ${Math.round(fileToUpload.size / (1024 * 1024))} MB e excede 50 MB. Cancelando os envios restantes.`);
        setUploading(false);
        return;
      }

      // Append index to title if there are multiple files
      let finalTitle = videoTitle;
      if (videoFiles.length > 1) {
        finalTitle = `${videoTitle} (${i + 1}/${videoFiles.length})`;
      }

      const cleanFileName = `${Date.now()}_${finalTitle
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9]/g, "-")}.mp4`;

      const filePath = cleanFileName;

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/temp-videos/${filePath}`;

          xhr.open("POST", uploadUrl, true);
          xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
          xhr.setRequestHeader("Authorization", `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`);
          xhr.setRequestHeader("Content-Type", fileType);
          xhr.setRequestHeader("x-upsert", "true");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percent);
            }
          };

          xhr.onload = async () => {
            if (xhr.status === 200 || xhr.status === 201) {
              const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/temp-videos/${filePath}`;
              try {
                const webhookUrl = "https://n8n-vaarcoiris.onrender.com/webhook/tally-vaarcoiris";
                const response = await fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: finalTitle,
                    author_name: authorName,
                    video_url: publicUrl,
                  }),
                });

                if (response.ok) {
                  resolve();
                } else {
                  reject(new Error(`Erro ao notificar automação do n8n para o vídeo ${i + 1}.`));
                }
              } catch (err) {
                console.error(err);
                reject(new Error(`Falha ao iniciar a publicação do vídeo ${i + 1} no n8n.`));
              }
            } else {
              console.error("Upload error response:", xhr.responseText);
              reject(new Error(`Erro ao enviar o vídeo ${i + 1} para o armazenamento.`));
            }
          };

          xhr.onerror = () => {
            reject(new Error(`Erro de rede durante o upload do vídeo ${i + 1}.`));
          };

          xhr.send(fileToUpload);
        });
      } catch (uploadError: unknown) {
        const error = uploadError as Error;
        setErrorMsg(error.message || `Erro ao processar o vídeo ${i + 1}.`);
        setUploading(false);
        return; // Break the loop, stop further processing
      }
    }

    // Finished processing all files successfully
    setAuthorName("");
    setVideoTitle("");
    setVideoFiles([]);
    setUploading(false);
    handleUploadSuccess();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const getEmbedUrl = (url: string) => {
    const videoId = getVideoId(url);
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    return url;
  };

  return (
    <div className={styles.page}>
      <header className={`${styles.header} glass-panel`}>
        <div className={styles.logoContainer}>
          <Image
            src="/logo.jpeg"
            alt="VA'ARCO-ÍRIS Logo"
            width={80}
            height={80}
            className={styles.logo}
            unoptimized
          />
          <h1 className="rainbow-text">VA&apos;ARCO-ÍRIS</h1>
        </div>
        <nav className={styles.nav}>
          <a href="#feed">Feed</a>
          <button
            onClick={() => {
              setUploadSuccess(false);
              setIsModalOpen(true);
            }}
            className="btn btn-rainbow"
          >
            Enviar Vídeo
          </button>
        </nav>
      </header>

      {/* Success toast */}
      {uploadSuccess && (
        <div className={styles.successToast}>
          <span>✅</span>
          <div>
            <strong>Vídeo enviado com sucesso!</strong>
            <p>
              {isPolling
                ? "Processando e publicando no YouTube... Aparecerá no feed em instantes."
                : "Seu vídeo já está no feed!"}
            </p>
          </div>
          <button onClick={() => setUploadSuccess(false)}>×</button>
        </div>
      )}

      <main className={styles.main}>
        <section className={styles.hero}>
          <h2 className={styles.heroTitle}>
            A nossa canoa, <span className="rainbow-text">agora em vídeo</span>.
          </h2>
          <p className={styles.heroSubtitle}>
            Compartilhe os melhores momentos, treinos e remadas com toda a
            equipe. Faça o upload diretamente por aqui.
          </p>
          <div className={styles.heroActions}>
            <button
              onClick={() => {
                setUploadSuccess(false);
                setIsModalOpen(true);
              }}
              className="btn btn-rainbow"
              style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}
            >
              Subir Meu Vídeo
            </button>
            <a
              href="#feed"
              className="btn btn-primary"
              style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}
            >
              Ver Feed
            </a>
          </div>
        </section>

        <section id="feed" className={styles.feed}>
          <div className={styles.feedHeader}>
            <h3>Últimos Vídeos</h3>
            <div className={styles.feedFilters}>
              <button
                className={`${styles.filterBtn} ${styles.active}`}
                onClick={fetchVideos}
                disabled={isRefreshing}
                title="Atualizar feed"
              >
                {isRefreshing ? "Carregando..." : "↻ Atualizar"}
              </button>
              <button className={styles.filterBtn}>Todos</button>
              <button className={styles.filterBtn}>Treinos</button>
              <button className={styles.filterBtn}>Eventos</button>
            </div>
          </div>

          <div className={styles.videoGrid}>
            {isLoading ? (
              <p style={{ color: "#a1a1aa" }}>Carregando vídeos...</p>
            ) : videos.length > 0 ? (
              videos.map((video) => {
                const videoId = getVideoId(video.youtube_url);
                const isPlaying = activeVideoId === video.id;

                return (
                  <div
                    key={video.id}
                    className={`${styles.videoCard} glass-panel`}
                  >
                    <div
                      className={styles.videoThumbnail}
                      style={{ padding: 0, position: "relative" }}
                    >
                      {isPlaying ? (
                        <iframe
                          src={`${getEmbedUrl(video.youtube_url)}?autoplay=1`}
                          title={video.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            position: "absolute",
                            top: 0,
                            left: 0,
                            border: "none",
                          }}
                          allowFullScreen
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        />
                      ) : (
                        <div
                          onClick={() => setActiveVideoId(video.id)}
                          className={styles.thumbnailContainer}
                        >
                          <img
                            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                            alt={video.title}
                            className={styles.thumbnailImage}
                          />
                          <div className={styles.thumbnailOverlay}>
                            <div className={styles.playIcon}>▶</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={styles.videoInfo}>
                      <h4>{video.title}</h4>
                      <p>Enviado por: {video.author_name}</p>
                      <span>{formatDate(video.created_at)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`${styles.videoCard} glass-panel`}>
                <div className={styles.videoThumbnail}>
                  <div className={styles.playIcon}>▶</div>
                </div>
                <div className={styles.videoInfo}>
                  <h4>Nenhum vídeo ainda...</h4>
                  <p>Seja o primeiro a enviar um vídeo!</p>
                  <span>Agora mesmo</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          id="enviar"
          className={`${styles.uploadSection} glass-panel`}
        >
          <h3>Direto da Galeria pro nosso Feed</h3>
          <p
            style={{ color: "#a1a1aa", maxWidth: "600px", lineHeight: "1.6" }}
          >
            Nossa plataforma suporta vídeos pesados. Basta clicar no botão
            abaixo, selecionar o vídeo da sua galeria ou computador, e nossa
            automação cuidará do resto (upload, otimização e publicação
            automática aqui no feed).
          </p>
          <button
            onClick={() => {
              setUploadSuccess(false);
              setIsModalOpen(true);
            }}
            className="btn btn-rainbow"
            style={{ marginTop: "2rem", padding: "1rem 3rem", fontSize: "1.2rem" }}
          >
            Fazer Upload Agora
          </button>
        </section>
        <section id="sobre" className={`${styles.aboutSection} glass-panel`}>
          <div className={styles.aboutHeader}>
            <span className={styles.aboutEmoji}>🌈</span>
            <h3>Sobre o VA'ARCO-ÍRIS</h3>
            <p>Uma alegria ter você conosco! Nossa caminhada é guiada pelo respeito, parceria e conexão nas águas.</p>
          </div>
          
          <div className={styles.aboutGrid}>
            <div className={styles.aboutCard}>
              <div className={styles.aboutCardIcon}>🌺</div>
              <h4>Nossas Canoas</h4>
              <p>Hoje o projeto conta com duas canoas para nossos treinos e passeios:</p>
              <ul>
                <li><strong>Íris</strong> — comprada pela Betse</li>
                <li><strong>Cacau</strong> — em sociedade com David Leão</li>
              </ul>
            </div>
            
            <div className={styles.aboutCard}>
              <div className={styles.aboutCardIcon}>🚣‍♀️</div>
              <h4>Horários das Remadas</h4>
              <ul>
                <li><strong>Seg a Sex:</strong> 7h15 e 8h30</li>
                <li><strong>Tardes:</strong> Ocasionalmente no pôr do sol às 16h</li>
                <li><strong>Finais de Semana:</strong> Passeios e remadas especiais</li>
              </ul>
            </div>
            
            <div className={styles.aboutCard}>
              <div className={styles.aboutCardIcon}>✨</div>
              <h4>Apoie o Projeto</h4>
              <p>As remadas são gratuitas, mas a manutenção da base é coletiva. Contribua como puder e ajude a manter esse sonho vivo!</p>
              <div className={styles.pixBox}>
                <span>📌 PIX:</span>
                <strong>vaarcoiris@gmail.com</strong>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>VA&apos;ARCO-ÍRIS © {new Date().getFullYear()}</p>
      </footer>

      {isModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={() => !uploading && setIsModalOpen(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.closeBtn}
              onClick={() => !uploading && setIsModalOpen(false)}
              disabled={uploading}
            >
              ×
            </button>
            <h3 style={{ marginBottom: "1rem" }}>Upload de Vídeo</h3>
            <p style={{ color: "#a1a1aa", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
              Compartilhe seu vídeo diretamente com a equipe. Arquivos de até 300 MB serão compactados automaticamente.
            </p>
            
            {errorMsg && (
              <div className={styles.errorBanner} style={{ color: "#f87171", backgroundColor: "rgba(248, 113, 113, 0.1)", border: "1px solid rgba(248, 113, 113, 0.2)", padding: "0.75rem", borderRadius: "12px", marginBottom: "1rem", fontSize: "0.9rem" }}>
                ⚠️ {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.uploadForm} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label htmlFor="authorName" style={{ fontSize: "0.9rem", fontWeight: 500, color: "#e4e4e7" }}>Seu Nome</label>
                <input
                  type="text"
                  id="authorName"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Ex: João Silva"
                  required
                  disabled={uploading}
                  style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "12px", border: "1px solid var(--glass-border)", backgroundColor: "rgba(255,255,255,0.05)", color: "white", outline: "none" }}
                />
              </div>

              <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label htmlFor="videoTitle" style={{ fontSize: "0.9rem", fontWeight: 500, color: "#e4e4e7" }}>Título do Vídeo</label>
                <input
                  type="text"
                  id="videoTitle"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Ex: Treino Técnico - Sábado"
                  required
                  disabled={uploading}
                  style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "12px", border: "1px solid var(--glass-border)", backgroundColor: "rgba(255,255,255,0.05)", color: "white", outline: "none" }}
                />
              </div>

              <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: 500, color: "#e4e4e7" }}>Arquivos de Vídeo</label>
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    width: "100%", 
                    padding: "2rem 1rem", 
                    borderRadius: "12px", 
                    border: `2px dashed ${isDragging ? "var(--accent)" : "rgba(255,255,255,0.2)"}`, 
                    backgroundColor: isDragging ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)", 
                    color: "white", 
                    textAlign: "center",
                    cursor: uploading ? "default" : "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => !uploading && document.getElementById("videoFilesInput")?.click()}
                >
                  <input
                    type="file"
                    id="videoFilesInput"
                    accept="video/*"
                    multiple
                    onChange={handleFileChange}
                    disabled={uploading}
                    style={{ display: "none" }}
                  />
                  <p style={{ margin: 0, color: isDragging ? "white" : "#a1a1aa" }}>
                    {isDragging ? "Solte os vídeos aqui..." : "Arraste e solte vídeos aqui ou clique para selecionar"}
                  </p>
                </div>
                
                {videoFiles.length > 0 && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <p style={{ fontSize: "0.85rem", color: "#e4e4e7", fontWeight: 500 }}>Vídeos selecionados ({videoFiles.length}):</p>
                    {videoFiles.map((file, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", padding: "0.5rem 0.75rem", borderRadius: "8px", fontSize: "0.85rem" }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>{file.name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          <span style={{ color: "#a1a1aa" }}>{Math.round(file.size / (1024 * 1024))} MB</span>
                          {!uploading && (
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                              style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "1.2rem", padding: "0", lineHeight: "1" }}
                              title="Remover"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: "0.8rem", color: "#a1a1aa", marginTop: "0.25rem" }}>Formatos recomendados: .mp4, .mov, .avi. Máximo 300 MB por arquivo (serão processados e enviados em fila).</span>
              </div>

              {uploading && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "white", marginBottom: "0.25rem" }}>
                    Processando vídeo {currentUploadIndex + 1} de {videoFiles.length}...
                  </div>
                  {compressing ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#a1a1aa" }}>
                        <span>Compactando e otimizando...</span>
                        <span>{compressionProgress}%</span>
                      </div>
                      <div className={styles.progressBar} style={{ width: "100%", height: "8px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "999px", overflow: "hidden" }}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${compressionProgress}%`, height: "100%", background: "linear-gradient(90deg, #3b82f6, #06b6d4)", transition: "width 0.2s ease", borderRadius: "999px" }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#a1a1aa" }}>
                        <span>Enviando arquivo...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className={styles.progressBar} style={{ width: "100%", height: "8px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "999px", overflow: "hidden" }}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--rainbow-gradient)", transition: "width 0.2s ease", borderRadius: "999px" }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-primary"
                  disabled={uploading}
                  style={{ padding: "0.75rem 1.5rem", borderRadius: "12px" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-rainbow"
                  disabled={uploading || videoFiles.length === 0}
                  style={{ padding: "0.75rem 2rem", borderRadius: "12px" }}
                >
                  {uploading ? "Processando Fila..." : "Enviar Vídeo(s)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
