export interface Track {
  id: string;          // id do arquivo no Drive
  title: string;
  artist: string;      // '' quando não identificado
  fileName: string;    // nome original no Drive (usado dentro do .zip)
  collectionId: string;
  md5: string;
  size: number;        // bytes
  url: string;         // URL pública do áudio
}

export interface Collection {
  id: string;          // id da pasta no Drive
  name: string;
  parentId: string | null;
  color: string;       // cor chapada da capa
  childIds: string[];
  trackIds: string[];  // faixas diretas, em ordem
  zipUrls: string[];   // 0, 1 ou várias partes
  zipKey: string;      // hash das faixas que o zip atual contém ('' se nenhum)
}

export interface Catalog {
  generatedAt: string;
  rootId: string;
  pendingDeletes?: string[]; // urls órfãs a apagar no próximo ciclo (o site ignora)
  sample?: boolean;    // true no catálogo de amostra (o sync o ignora como estado)
  collections: Collection[];
  tracks: Track[];
}
