export function showSidebarContextMenu(x, y, { onMoveToTrash }) {
  dismissSidebarContextMenu();

  const menu = document.createElement("div");
  menu.className = "sidebar-context-menu";
  menu.setAttribute("role", "menu");

  const item = document.createElement("button");
  item.type = "button";
  item.className = "sidebar-context-menu-item";
  item.setAttribute("role", "menuitem");
  item.textContent = "Delete";
  menu.appendChild(item);

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  }

  item.addEventListener("click", () => {
    dismissSidebarContextMenu();
    onMoveToTrash();
  });

  requestAnimationFrame(() => {
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
  });
}

function handleOutsideClick(event) {
  const menu = document.querySelector(".sidebar-context-menu");
  if (menu && !menu.contains(event.target)) {
    dismissSidebarContextMenu();
  }
}

function handleEscape(event) {
  if (event.key === "Escape") {
    dismissSidebarContextMenu();
  }
}

function dismissSidebarContextMenu() {
  const existing = document.querySelector(".sidebar-context-menu");
  if (existing) {
    existing.remove();
  }
  document.removeEventListener("pointerdown", handleOutsideClick);
  document.removeEventListener("keydown", handleEscape);
}
