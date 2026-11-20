// Capas pelo NOME da pasta (além do id). Assim a troca para o acervo "Louvores -  2.0", com pastas de ids
// novos, já chega com fotos. Chave: nome da pasta nova; valor: nome da coleção antiga dona da foto em
// coverData.json (reaproveita as fotos e os créditos que já existem). Subpastas ("Vol. 01"...) herdam a do pai.
export const COVER_BY_NAME: Record<string, string> = {
  // Louvores › Antigos e Novos
  'Antigos e Novos': 'Gospel Nostálgico  - Os Louvores que Marcaram Gerações',
  'Louvores Antigos': 'Hinos Antigos',
  'Gospel Atual': 'Gospel Atual',
  'Lançamentos': 'Lançamentos 2027',
  'Anos 70': 'Gospel Antigas Anos 70 e 80',
  'Anos 80': 'As Melhores Antigas Gospel',
  'Anos 90': 'Clássicos Gospel - As melhores Anos 90, 2000, 2010',
  'Anos 2000': 'Adoração Raiz das antigas anos 90 e 2000',
  // Louvores › Cantores / Mais Ouvidas
  'Cantores': 'Gospel 03',
  'Mais Ouvidas': '10. As mais tocadas',
  'Top 100 Nacional': 'Gospel',
  'Top 100 Internacional': 'Gospel Hits Internacionais 01',
  'Cassiane': 'Cassiane',
  'Jair Pires': 'Jair Pires',
  'Denise': 'Denise',
  'Álvaro Tito': 'Álvaro Tito',
  'Arautos do Rei': 'Arautos do Rei',
  'Grupo Integração': 'Grupo Integração',
  'Grupo Nova Dimensão': 'Grupo Nova Dimensão',
  'Grupo VP': 'Grupo VP',
  // Louvores › Estilos
  'Estilos': 'Gospel Hits Internacionais 02',
  'Worship': 'Worship Brasil',
  'Pentecostal': 'Louvores Gospel',
  'Black Gospel': 'Grupo VP',
  'Pop Gospel': 'Louvores jovens',
  'Rock': 'Gospel Atual',
  'Corais': 'Arautos do Rei',
  'Hinos': 'Hinos da Harpa e Louvores Antigos',
  'Espanhol': 'Gospel 04',
  'Acústicos': 'Gospel Acústico',
  'Playbacks': 'Gospel 01',
  'Remixes': 'Gospel 05',
  'Ao Vivo': 'Louvor & Adoração',
  // Louvores › Para Cada Momento
  'Para Cada Momento': 'Biblioteca Organizada por Momento',
  'Adoração Profunda': '5. Adoração profunda',
  'Conforto na Dor': '4. Conforto na dor',
  'Gratidão': 'J. Neto - 2007 - Bem Aventurado',
  'Louvor de Guerra': '3. Louvor de guerra',
  'Manhã com Deus': '1. Manhã com Deus',
  'Na Estrada': '2. Na estrada com Deus',
  'Paz para Dormir': '6. Paz para dormir',
  // Para as Crianças
  'Para as Crianças': 'Bônus 1 - Hinos Infantis',
  'Hinos Infantis': '8. Hinos infantis',
  'Cantar e Dançar': 'Gospel Animadas Antigas',
  'Histórias da Bíblia': 'Grupo Nova Dimensão',
  'Hora de Dormir': 'Gospel 06',
};

export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
