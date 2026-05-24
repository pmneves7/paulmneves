const GALLERY_ITEMS = [
  {
    src: "media/gallery/mosaic.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/beamline.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/dinner.JPG",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/crystals.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/license_plate.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/IMG_4068.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/IMG_3310.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/defense_celebration.PNG",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/discourse.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/MIT.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/march_meeting.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/beamline2.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/recursive.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/dinner.jpeg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/32c927da-b67c-4459-b3f7-408665b0b7f2.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/beamline3.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/beamline4.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/strain.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/mosaic2.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/dilution_fridge.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/josh_switzerland.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/beamline5.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/dilution2.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/SNS.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/wheeler.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/arpes.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/maglab.jpg",
    alt: "",
    title: "",
    caption: "",
  },
  {
    src: "media/gallery/rotator.jpg",
    alt: "",
    title: "",
    caption: "",
  },
];

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  const empty = document.getElementById("gallery-empty");
  if (!grid || !empty) return;

  if (GALLERY_ITEMS.length === 0) {
    empty.hidden = false;
    grid.hidden = true;
    return;
  }

  empty.hidden = true;
  grid.hidden = false;
  grid.replaceChildren();

  const dialog = document.getElementById("gallery-lightbox");
  const dialogImg = document.getElementById("gallery-lightbox-img");
  const dialogCaption = document.getElementById("gallery-lightbox-caption");

  if (dialog && !dialog.dataset.bound) {
    dialog.dataset.bound = "true";
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  for (const item of GALLERY_ITEMS) {
    const figure = document.createElement("figure");
    figure.className = "gallery-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery-thumb";
    button.setAttribute("aria-label", item.alt || "View image");
    if (item.title) {
      button.title = item.title;
    }

    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.alt || "";
    img.loading = "lazy";
    if (item.title) {
      img.title = item.title;
    }

    button.appendChild(img);
    button.addEventListener("click", () => {
      if (!dialog || !dialogImg) return;
      dialogImg.src = item.src;
      dialogImg.alt = item.alt || "";
      if (item.title) {
        dialogImg.title = item.title;
      } else {
        dialogImg.removeAttribute("title");
      }
      if (dialogCaption) {
        dialogCaption.textContent = item.caption || "";
        dialogCaption.hidden = !item.caption;
      }
      dialog.showModal();
    });

    figure.appendChild(button);

    if (item.caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = item.caption;
      figure.appendChild(figcaption);
    }

    grid.appendChild(figure);
  }
}

renderGallery();
