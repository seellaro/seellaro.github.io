const state = {
  currentDocId: localStorage.getItem('currentDocId'),
};

const editor = document.getElementById('editor');
const historyContainer = document.getElementById('history');
const boldButton = document.getElementById('bold');
const italicButton = document.getElementById('italic');
const underlineButton = document.getElementById('underline');
const fontSizeSelect = document.getElementById('fontSize');
const fontColorInput = document.getElementById('fontColor');
const newDocButton = document.getElementById('newDoc');
const downloadButton = document.getElementById('download');

// Ensure editor is contenteditable
editor.contentEditable = true;

// Загрузка истории при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  updateButtonStates();
});

// Сохранение текста при вводе
editor.addEventListener('input', () => {
  const currentDoc = getCurrentDocument();
  if (currentDoc) {
    currentDoc.content = editor.innerHTML;
    currentDoc.name = generateDocName(editor.innerText);
    currentDoc.date = new Date().toLocaleString();
    saveDocument(currentDoc);
    updateHistory(currentDoc.id);
  }
});

// Обработка нажатия Enter для сброса размера шрифта
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault(); // Предотвращаем стандартное поведение
    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const newParagraph = document.createElement('p');
      newParagraph.style.fontSize = ''; // Сбрасываем размер шрифта
      range.insertNode(newParagraph);
      range.setStart(newParagraph, 0);
      range.setEnd(newParagraph, 0);
      selection.removeAllRanges();
      selection.addRange(range);
      // Вставляем <br> для корректного перехода на новую строку
      document.execCommand('insertLineBreak');
    }
  }
});

// Создание нового документа
newDocButton.addEventListener('click', () => {
  const doc = {
    id: Date.now(),
    name: 'Без названия',
    content: '',
    date: new Date().toLocaleString()
  };
  saveDocument(doc);
  setCurrentDocument(doc.id);
  editor.innerHTML = '';
  updateHistory(doc.id);
});

// Скачивание текста
downloadButton.addEventListener('click', () => {
  const currentDoc = getCurrentDocument();
  if (currentDoc) {
    const blob = new Blob([currentDoc.content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDoc.name}.html`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    alert('Нет документа для экспорта.');
  }
});

// Функция для генерации имени документа
function generateDocName(text) {
  if (!text.trim()) return 'Без названия';
  const firstLine = text.split('\n')[0].trim();
  if (!firstLine) return 'Без названия';
  const words = firstLine.split(/\s+/).filter(word => word);
  const maxWords = 5;
  const selectedWords = words.slice(0, maxWords);
  const name = selectedWords.join(' ');
  return words.length > maxWords ? `${name}...` : name;
}

// Функции для работы с localStorage
function getDocuments() {
  return JSON.parse(localStorage.getItem('documents') || '[]');
}

function saveDocument(doc) {
  const documents = getDocuments();
  const index = documents.findIndex(d => d.id === doc.id);
  if (index !== -1) {
    documents[index] = doc;
  } else {
    documents.unshift(doc);
  }
  localStorage.setItem('documents', JSON.stringify(documents));
}

function deleteDocument(id) {
  const histElement = $(`.hist[data-id="${id}"]`);

  const finalizeDeletion = () => {
    let documents = getDocuments();
    documents = documents.filter(doc => doc.id !== id);
    localStorage.setItem('documents', JSON.stringify(documents));

    const currentId = Number(localStorage.getItem('currentDocId'));
    if (currentId === id) {
      localStorage.removeItem('currentDocId');
      editor.innerHTML = '';
    }

    updateHistory();
  };

  if (histElement.length) {
    histElement.css('display', 'block');
    histElement.fadeTo(200, 0).slideUp(300, function () {
      histElement.remove();
      finalizeDeletion();
    });
  } else {
    finalizeDeletion();
  }
}

function getCurrentDocument() {
  const currentId = localStorage.getItem('currentDocId');
  const documents = getDocuments();
  return documents.find(doc => doc.id === Number(currentId));
}

function setCurrentDocument(id) {
  localStorage.setItem('currentDocId', id);
}

// Обновление истории с анимациями
function updateHistory(updatedDocId = null) {
  const documents = getDocuments();
  // Sort documents by date in descending order (newest first)
  documents.sort((a, b) => new Date(b.date) - new Date(a.date));
  const currentDocId = Number(localStorage.getItem('currentDocId'));

  // If no specific document is updated, re-render all without animations
  if (!updatedDocId) {
    $(historyContainer).empty();
    documents.forEach((doc) => {
      const hist = $(`<div class="hist" data-id="${doc.id}"></div>`);
      hist.html(
        '<div class="name">' + doc.name + '</div>' +
        '<div class="hest-del">' +
          '<button class="delete-btn"><img src="images/delete.svg" align="bottom"></button>' +
          '<p>' + doc.date + '</p>' +
        '</div>'
      );
      hist.appendTo(historyContainer);

      hist.off('click').on('click', function(event) {
        if (!$(event.target).closest('.delete-btn').length) {
          setCurrentDocument(doc.id);
          editor.innerHTML = doc.content;
        }
      });

      hist.find('.delete-btn').off('click').on('click', function(event) {
        event.stopPropagation();
        deleteDocument(doc.id);
      });
    });
    return;
  }

  // Update or add the specific document
  const doc = documents.find(d => d.id === updatedDocId);
  if (!doc) return;

  let hist = $(`.hist[data-id="${doc.id}"]`);
  if (hist.length) {
    // Update existing document
    hist.find('.name').text(doc.name);
    hist.find('.hest-del p').text(doc.date);
    // Move to top if not already there
    if (hist.index() !== 0) {
      hist.detach().prependTo(historyContainer);
    }
  } else {
    // Add new document with animation
    hist = $(`<div class="hist" data-id="${doc.id}"></div>`);
    hist.html(
      '<div class="name">' + doc.name + '</div>' +
      '<div class="hest-del">' +
        '<button class="delete-btn"><img src="images/delete.svg" align="bottom"></button>' +
        '<p>' + doc.date + '</p>' +
      '</div>'
    );
    hist.css({ display: 'none', opacity: 0 }).prependTo(historyContainer);
    hist.slideDown(300, "swing").animate({ opacity: 1 }, { duration: 300, queue: false });
  }

  hist.off('click').on('click', function(event) {
    if (!$(event.target).closest('.delete-btn').length) {
      setCurrentDocument(doc.id);
      editor.innerHTML = doc.content;
    }
  });

  hist.find('.delete-btn').off('click').on('click', function(event) {
    event.stopPropagation();
    deleteDocument(doc.id);
  });

  // Remove any DOM elements that no longer exist in documents
  $('.hist').each(function() {
    const id = Number($(this).attr('data-id'));
    if (!documents.some(doc => doc.id === id)) {
      $(this).slideUp(300).animate({ opacity: 0 }, { duration: 300, queue: false, complete: function() {
        $(this).remove();
      }});
    }
  });
}

// Загрузка истории и текущего документа
function loadHistory() {
  updateHistory();
  const currentDoc = getCurrentDocument();
  if (currentDoc) {
    editor.innerHTML = currentDoc.content;
  }
}

// Применение стилей
const applyStyle = (style, value = null) => {
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(style, false, value);
};

boldButton.addEventListener('click', () => applyStyle('bold'));
italicButton.addEventListener('click', () => applyStyle('italic'));
underlineButton.addEventListener('click', () => applyStyle('underline'));

// Обработка изменения размера шрифта
fontSizeSelect.addEventListener('change', (event) => {
  const fontSize = event.target.value + 'px';
  const selection = window.getSelection();
  if (selection.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = fontSize;
    try {
      range.surroundContents(span);
    } catch (e) {
      const selectedContent = range.extractContents();
      span.appendChild(selectedContent);
      range.insertNode(span);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    // Применяем размер шрифта к текущему узлу или новому span
    const range = selection.getRangeAt(0);
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    if (node === editor || node.tagName === 'P' || node.tagName === 'DIV') {
      const span = document.createElement('span');
      span.style.fontSize = fontSize;
      range.insertNode(span);
      range.setStart(span, 0);
      range.setEnd(span, 0);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      node.style.fontSize = fontSize;
    }
  }
  updateButtonStates();
});

fontColorInput.addEventListener('input', (event) => {
  applyStyle('foreColor', event.target.value);
});

// Функция для обновления состояния кнопок и размера шрифта
function updateButtonStates() {
  const selection = window.getSelection();
  if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
    boldButton.classList.remove('active');
    italicButton.classList.remove('active');
    underlineButton.classList.remove('active');
    fontSizeSelect.classList.remove('active');
    fontSizeSelect.value = '14'; // Сбрасываем на значение по умолчанию
    return;
  }

  let node = selection.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  const computedStyle = window.getComputedStyle(node);

  // Проверяем стили для кнопок
  boldButton.classList.toggle('active', computedStyle.fontWeight >= 700);
  italicButton.classList.toggle('active', computedStyle.fontStyle === 'italic');
  underlineButton.classList.toggle('active', computedStyle.textDecoration.includes('underline'));

  // Проверяем размер шрифта
  const fontSize = computedStyle.fontSize.replace('px', '');
  const availableSizes = Array.from(fontSizeSelect.options).map(opt => opt.value);
  if (availableSizes.includes(fontSize)) {
    fontSizeSelect.value = fontSize;
    fontSizeSelect.classList.add('active');
  } else {
    fontSizeSelect.value = '14'; // Значение по умолчанию
    fontSizeSelect.classList.remove('active');
  }
}

// Обновляем состояние кнопок при взаимодействии с редактором
editor.addEventListener('keyup', updateButtonStates);
editor.addEventListener('click', updateButtonStates);
document.addEventListener('selectionchange', debounce(updateButtonStates, 100));

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}