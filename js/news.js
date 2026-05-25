const NEWS_ITEMS = [
  {
    date: "May 2026",
    content: `<a href="https://arxiv.org/abs/2512.16990"><em>A General Approach to Solving Spin Moiré Superstructures</em></a> accepted in <em>Phys. Rev. X</em>.`,
  },
  {
    date: "April 2026",
    content: `<em>Cascade of Spin Moiré Superlattices with In-Plane Field in Triangular Lattice Semimetal EuAg<sub>4</sub>Sb<sub>2</sub></em> published in <a href="https://doi.org/10.1021/acsnano.5c18732"><em>ACS Nano</em></a> and featured on the <a href="https://pubs.acs.org/toc/ancac3/20/19">journal cover</a>.`,
  },
  {
    date: "April 2026",
    content: `Created animated visualizations for Kevin Nuckolls’s recent <a href="https://doi.org/10.1038/s41586-026-10173-8"><em>Nature</em> paper</a> on higher-dimensional fermiology in bulk moiré metals — see the <a href="https://physics.mit.edu/news/electrons-in-moire-crystals-explore-higher-dimensional-quantum-worlds/">MIT Physics news article</a> and <a href="https://www.youtube.com/watch?v=lXXhfxj54t4">animation on YouTube</a>.`,
  },
  {
    date: "September 2025",
    content: `Joined the Department of Physics &amp; Astronomy at Johns Hopkins University as a Gordon and Betty Moore Postdoctoral Fellow, working with <a href="https://physics-astronomy.jhu.edu/directory/collin-l-broholm/">Collin Broholm</a>.`,
  },
  {
    date: "April 2025",
    content: `Defended Ph.D. thesis, <em>Flat Bands and Magnetism in Frustrated Lattice Materials</em> (committee: Joseph G. Checkelsky, Riccardo Comin, Wolfgang Ketterle).`,
  },
];

const HOME_NEWS_COUNT = 5;

function renderNewsList(listId, limit) {
  const list = document.getElementById(listId);
  if (!list) return;

  const items = typeof limit === "number" ? NEWS_ITEMS.slice(0, limit) : NEWS_ITEMS;
  list.replaceChildren();

  for (const item of items) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.date}:</strong> ${item.content}`;
    list.appendChild(li);
  }
}
