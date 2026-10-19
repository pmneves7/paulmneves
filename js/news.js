const NEWS_ITEMS = [
  {
    date: "October 2026",
    content: `Thank you to the Swiss Neutron Science Society for honoring me with the <a href="https://www.neutronscience.ch/young_scientist_prize/winners">2026 Young Scientist Award</a> for my thesis work, partly undertaken at the Swiss Spallation Neutron Source!`,
  },
  {
    date: "June 2026",
    content: `<a href="https://journals.aps.org/prx/abstract/10.1103/bjq3-py7l"><em>General Approach to Solving Spin Moiré Superstructures</em></a> published in <em>Phys. Rev. X</em>.`,
  },
  {
    date: "April 2026",
    content: `Congratulations to Frank Zhao on <a href="https://doi.org/10.1038/s41567-026-03185-8"><em>High-field triplet superconductivity in a transition metal dichalcogenide superlattice</em></a>, published in <em>Nature Physics</em> — see the <a href="https://phys.org/news/2026-04-alternating-atomic-layers-enable-rare.html">Phys.org news article</a>.`,
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
  {
    date: "January 2025",
    content: `Congratulations to Mingu Kang on <a href="https://doi.org/10.1038/s41567-024-02678-8"><em>Measurements of the quantum geometric tensor in solids</em></a>, published in <em>Nature Physics</em> — see the <a href="https://physics.mit.edu/news/physicists-measure-quantum-geometry-for-the-first-time/">MIT Physics news article</a>.`,
  },
  {
    date: "May 2024",
    content: `Congratulations to Ryan McTigue on winning a <a href="https://physics.mit.edu/news/eleven-from-mit-awarded-2024-fulbright-fellowships/">Fulbright Fellowship</a>! It was a pleasure working with Ryan on crystal growth and measurement during his undergraduate studies at MIT.`,
  },
  {
    date: "April 2024",
    content: `Congratulations to Linda Ye on <a href="https://doi.org/10.1038/s41567-023-02360-5"><em>Hopping frustration-induced flat band and strange metallicity in a kagome metal</em></a>, published in <em>Nature Physics</em> — see the <a href="https://physics.mit.edu/news/physicists-discover-new-way-to-make-strange-metal/">MIT Physics news article</a>.`,
  },
  {
    date: "November 2023",
    content: `<a href="https://doi.org/10.1038/s41586-023-06640-1"><em>Three-dimensional flat bands in pyrochlore metal CaNi<sub>2</sub></em></a> published in <em>Nature</em> — see the <a href="https://news.mit.edu/2023/physicists-trap-electrons-3d-crystal-first-time-1108">MIT News article</a>.`,
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
