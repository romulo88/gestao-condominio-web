"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

type Ponto = { latitude: number; longitude: number; capturadoEm?: string };
type LatLng = [number, number];

const CENTRO_PADRAO: LatLng = [-23.5505, -46.6333];

/** Intervalo sem nenhum ponto de GPS a partir do qual o trecho é desenhado tracejado, em vez
 * de uma reta igual à do trajeto real - celular com tela bloqueada/app em segundo plano
 * suspende o GPS da página (achado do Romulo, ronda real), e a reta ligando o último ponto
 * antes ao primeiro depois parecia um trajeto de verdade. */
const LIMITE_LACUNA_MS = 60_000;

/** Quebra o trajeto em trechos contínuos (linha cheia) e lacunas entre eles (tracejada). */
function segmentar(pontos: Ponto[]): { trechos: LatLng[][]; lacunas: [LatLng, LatLng][] } {
  const trechos: LatLng[][] = [];
  const lacunas: [LatLng, LatLng][] = [];
  let atual: LatLng[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    const ll: LatLng = [p.latitude, p.longitude];
    const anterior = pontos[i - 1];
    if (anterior && anterior.capturadoEm && p.capturadoEm) {
      const diff = new Date(p.capturadoEm).getTime() - new Date(anterior.capturadoEm).getTime();
      if (diff > LIMITE_LACUNA_MS) {
        trechos.push(atual);
        lacunas.push([[anterior.latitude, anterior.longitude], ll]);
        atual = [];
      }
    }
    atual.push(ll);
  }
  if (atual.length > 0) trechos.push(atual);
  return { trechos, lacunas };
}

/**
 * Mapa Leaflet (tiles OpenStreetMap, sem chave de API) do trajeto de uma ronda -
 * reaproveitado tanto na tela do rondista (ao vivo, trajeto crescendo a cada novo ponto de
 * GPS - ver `app/ronda/page.tsx`) quanto no detalhe de uma ronda na tela do síndico
 * (estático - ver `app/rondas/page.tsx`). Import de `leaflet` é dinâmico (dentro do
 * `useEffect`, nunca no topo do módulo) porque a lib acessa `window` já na importação -
 * não pode rodar durante SSR.
 *
 * Marcador da posição atual é um `divIcon` (círculo simples via CSS inline) em vez do ícone
 * padrão do Leaflet, que quebra sob bundlers (os PNGs não resolvem sozinhos) - evita esse
 * problema conhecido sem precisar de nenhum asset extra.
 */
export function MapaRonda({ pontos, className }: { pontos: Ponto[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<LeafletMap | null>(null);
  const camadasRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelado = false;
    import("leaflet").then((L) => {
      if (cancelado || !containerRef.current) return;
      const latLngs: LatLng[] = pontos.map((p) => [p.latitude, p.longitude]);

      if (!mapaRef.current) {
        const centro = latLngs.length > 0 ? latLngs[latLngs.length - 1] : CENTRO_PADRAO;
        const mapa = L.map(containerRef.current).setView(centro, latLngs.length > 0 ? 16 : 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapa);
        mapaRef.current = mapa;
      }
      const mapa = mapaRef.current;

      camadasRef.current?.remove();
      const camadas = L.layerGroup().addTo(mapa);
      camadasRef.current = camadas;

      const { trechos, lacunas } = segmentar(pontos);
      for (const trecho of trechos) {
        L.polyline(trecho, { color: "#2563eb", weight: 4 }).addTo(camadas);
      }
      for (const lacuna of lacunas) {
        L.polyline(lacuna, { color: "#f59e0b", weight: 3, dashArray: "6 8" }).addTo(camadas);
      }

      if (latLngs.length > 0) {
        const posicaoAtual = latLngs[latLngs.length - 1];
        const iconePosicao = L.divIcon({
          className: "",
          html: '<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        L.marker(posicaoAtual, { icon: iconePosicao }).addTo(camadas);
        if (latLngs.length > 1) {
          mapa.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
        } else {
          mapa.panTo(posicaoAtual);
        }
      }
    });
    return () => {
      cancelado = true;
    };
  }, [pontos]);

  // Remove o mapa só ao desmontar de vez o componente - as atualizações de trajeto acima
  // reaproveitam a mesma instância, nunca recriam o mapa a cada ponto novo.
  useEffect(
    () => () => {
      mapaRef.current?.remove();
      mapaRef.current = null;
    },
    [],
  );

  return <div ref={containerRef} className={className ?? "h-64 w-full rounded-lg"} />;
}
