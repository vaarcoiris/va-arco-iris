"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";

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
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const fetchVideos = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching videos:", error);
    } else if (data) {
      // Filter out invalid/test entries (empty or missing youtube ID)
      const validVideos = data.filter(
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
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Listen for Tally form submission
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.event === "Tally.FormSubmitted" ||
        (typeof event.data === "string" && event.data.includes("tally-form-submitted"))
      ) {
        handleUploadSuccess();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleUploadSuccess = () => {
    setIsModalOpen(false);
    setUploadSuccess(true);
    setIsPolling(true);

    // Poll for new video every 30 seconds, up to 10 minutes
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(async () => {
      attempts++;
      await fetchVideos();
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setIsPolling(false);
      }
    }, 30000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const getEmbedUrl = (url: string) => {
    let videoId = "";
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (url.includes("v=")) {
      videoId = url.split("v=")[1]?.split("&")[0];
    }
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
            width={48}
            height={48}
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
                title="Atualizar feed"
              >
                ↻ Atualizar
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
              videos.map((video) => (
                <div
                  key={video.id}
                  className={`${styles.videoCard} glass-panel`}
                >
                  <div
                    className={styles.videoThumbnail}
                    style={{ padding: 0, position: "relative" }}
                  >
                    <iframe
                      src={getEmbedUrl(video.youtube_url)}
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
                  </div>
                  <div className={styles.videoInfo}>
                    <h4>{video.title}</h4>
                    <p>Enviado por: {video.author_name}</p>
                    <span>{formatDate(video.created_at)}</span>
                  </div>
                </div>
              ))
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
      </main>

      <footer className={styles.footer}>
        <p>VA&apos;ARCO-ÍRIS © {new Date().getFullYear()} - Um projeto Aurora</p>
      </footer>

      {isModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.closeBtn}
              onClick={() => setIsModalOpen(false)}
            >
              ×
            </button>
            <h3 style={{ marginBottom: "1rem" }}>Upload de Vídeo</h3>
            <p style={{ color: "#a1a1aa", marginBottom: "2rem" }}>
              Selecione o vídeo que deseja compartilhar com a equipe.
            </p>
            <div className={styles.iframeContainer}>
              <iframe
                src="https://tally.so/r/q4gX57?transparentBackground=1"
                width="100%"
                height="100%"
                frameBorder="0"
                marginHeight={0}
                marginWidth={0}
                title="Upload de Vídeo"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
