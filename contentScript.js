function lineDifference(lineA, lineB) {
  const trimmedA = lineA.replace(/\ /g, '');
  const trimmedB = lineB.replace(/\ /g, '');
  if (trimmedA === trimmedB) {
    return 0;
  }
  return 1;
}

function extractDiff(diffTable) {
  // const leftLines = [
  //   '{{#shared::basic-dropdown',
  //   '  shouldStopPropagation=true',
  //   '  classNames="msg-thread-actions__dropdown"',
  //   '  as |dropdown|}}',
  // ];
  // const rightLines = [
  //   '{{#artdeco-dropdown',
  //   '  isOpen=isThreadActionDropdownOpen',
  //   '  onVisibilityChange=(action (mut isThreadActionDropdownOpen))',
  //   '  placement="bottom"',
  //   '  classNames="msg-thread-actions__dropdown"',
  //   '  as |dropdown|}}',
  // ];

  const leftLines = [];
  const rightLines = [];

  for (const diffSection of diffTable.getElementsByTagName('tbody')) {
    const sectionType = diffSection.className;

    for (const line of diffSection.getElementsByTagName('tr')) {
      const leftLine = line.querySelector('td.l');
      const rightLine = line.querySelector('td.r');

      let leftContent, rightContent;

      switch (sectionType) {
        case 'replace':
        case 'equal':
          leftContent = leftLine.querySelector('pre').textContent;
          leftLines.push(leftContent.replace(/\n/g, ''));

          rightContent = rightLine.querySelector('pre').textContent;
          rightLines.push(rightContent.replace(/\n/g, ''));
        break;

        case 'insert':
          rightContent = rightLine.querySelector('pre').textContent;
          rightLines.push(rightContent.replace(/\n/g, ''));
        break;

        case 'delete':
          leftContent = leftLine.querySelector('pre').textContent;
          leftLines.push(leftContent.replace(/\n/g, ''));
        break;
      }
    }
  }

  // WHAT'S WRONG
  // We changed the way we push lines to leftLines and rightLines, messing up the line indices

  return {
    left: leftLines,
    right: rightLines,
  };
}

function computeDiff(fileComparison) {
  const leftLines = fileComparison.left;
  const rightLines = fileComparison.right;

  const leftLineCount = leftLines.length;
  const rightLineCount = rightLines.length;

  const dpMtx = [];

  for (let leftIdx = 0; leftIdx < leftLineCount + 1; leftIdx++) {
    dpMtx[leftIdx] = [];
    for (let rightIdx = 0; rightIdx < rightLineCount + 1; rightIdx++) {
      let editDist = 0;
      if (leftIdx === 0) {
        editDist = rightIdx;
      } else if (rightIdx === 0) {
        editDist = leftIdx;
      }

      dpMtx[leftIdx][rightIdx] = {
        editDist,
        from: undefined,
        leftIdx,
        rightIdx,
      };
    }
  }

  for (let leftIdx = 1; leftIdx < leftLineCount + 1; leftIdx++) {
    for (let rightIdx = 1; rightIdx < rightLineCount + 1; rightIdx++) {
      const isSameLine = leftLines[leftIdx - 1] === rightLines[rightIdx - 1];

      const lineDiff = lineDifference(leftLines[leftIdx - 1], rightLines[rightIdx - 1]);

      const lineChangeResult = dpMtx[leftIdx - 1][rightIdx - 1];

      if (lineDiff === 0) {
        dpMtx[leftIdx][rightIdx].editDist = lineChangeResult.editDist;
        dpMtx[leftIdx][rightIdx].from = lineChangeResult;
      } else {
        const insertionResult = dpMtx[leftIdx - 1][rightIdx];
        const deletionResult = dpMtx[leftIdx][rightIdx - 1];

        let minResult;

        if (lineChangeResult.editDist < insertionResult.editDist) {
          if (lineChangeResult.editDist < deletionResult.editDist) {
            minResult = lineChangeResult;
          } else {
            minResult = deletionResult;
          }
        } else {
          if (insertionResult.editDist < deletionResult.editDist) {
            minResult = insertionResult;
          } else {
            minResult = deletionResult;
          }
        }

        const newEditDist =
          isSameLine ?
            minResult.editDist :
            minResult.editDist + 1;

        dpMtx[leftIdx][rightIdx].editDist = newEditDist;
        dpMtx[leftIdx][rightIdx].from = minResult;
      }
    }
  }

  const changes = [];
  let currResult = dpMtx[leftLineCount][rightLineCount];
  while (currResult) {
    const prevResult = currResult.from;

    if (!prevResult) {
      break;
    }

    let editType;

    if (currResult.editDist === prevResult.editDist) {
      editType = 'NO_CHANGE';
    } else {
      if (
        currResult.leftIdx === prevResult.leftIdx + 1 &&
        currResult.rightIdx === prevResult.rightIdx + 1
      ) {
        editType = 'LINE_CHANGE';
      } else if (currResult.leftIdx === prevResult.leftIdx + 1) {
        editType = 'DELETION';
      } else {
        editType = 'INSERTION';
      }
    }

    changes.unshift({
      editType,
      prevLineIdx: currResult.leftIdx - 1,
      currLineIdx: currResult.rightIdx - 1,
    });

    currResult = prevResult;
  }

  for (let beginningDeletionIdx = currResult.leftIdx - 1; beginningDeletionIdx >= 0; beginningDeletionIdx--) {
    changes.unshift({
      editType: 'DELETION',
      prevLineIdx: beginningDeletionIdx,
      currLineIdx: 0,
    });
  }

  for (let beginningInsertionIdx = currResult.rightIdx - 1; beginningInsertionIdx >= 0; beginningInsertionIdx--) {
    changes.unshift({
      editType: 'INSERTION',
      prevLineIdx: 0,
      currLineIdx: beginningInsertionIdx,
    });
  }

  // console.log(changes);

  // for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {
  //   const change = changes[changeIdx];
  //   const nextChange = changes[changeIdx + 1];

  //   switch (change.editType) {
  //     case 'NO_CHANGE':
  //       console.log(rightLines[change.currLineIdx]);
  //       break;
  //     case 'LINE_CHANGE':
  //       console.log('-', leftLines[change.prevLineIdx]);
  //       if (nextChange && nextChange.editType === 'LINE_CHANGE') {

  //       }
  //       console.log('+', rightLines[change.currLineIdx]);
  //       break;
  //     case 'INSERTION':
  //       console.log('+', rightLines[change.currLineIdx]);
  //       break;
  //     case 'DELETION':
  //       console.log('-', leftLines[change.prevLineIdx]);
  //       break;
  //   }
  // }

  return changes;
}

function createDisplayRow(changeType, changeValue) {
  const lineDisplay = document.createElement('tr');
  if (changeType === '+') {
    lineDisplay.style.backgroundColor = '#dfffd7';
  } else if (changeType === '-') {
    lineDisplay.style.backgroundColor = '#ffe0e5';
  }

  const changeTypeDisplay = document.createElement('td');
  changeTypeDisplay.innerHTML = changeType;
  lineDisplay.appendChild(changeTypeDisplay);

  const changeValueDisplay = document.createElement('td');

  if (changeValue) {
    changeValueDisplay.innerHTML = changeValue
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  } else {
    console.log(`ERROR: changeValue is undefined`);
  }

  lineDisplay.appendChild(changeValueDisplay);

  return lineDisplay;
}

function displayChanges(comparison, changes) {
  const modalLayer = document.createElement('div', 'diff-modal-layer');
  modalLayer.style.position = 'fixed';
  modalLayer.style.top = '0';
  modalLayer.style.left = '0';
  modalLayer.style.width = '100%';
  modalLayer.style.height = '100%';
  modalLayer.style.zIndex = '100';
  modalLayer.style.display = 'flex';
  modalLayer.style.alignItems = 'center';
  modalLayer.style.justifyContent = 'center';
  modalLayer.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
  modalLayer.addEventListener('click', () => {
    modalLayer.remove();
  });

  const modal = document.createElement('div', 'diff-modal');
  modal.style.backgroundColor = 'white';
  modal.style.width = '90%';
  modal.style.height = '90%';
  modal.style.overflowY = 'scroll';
  modal.style.fontFamily = 'monospace';
  modal.style.fontSize = '8pt';
  modal.style.whiteSpace = 'pre-wrap';
  modal.addEventListener('click', evt => {
    evt.stopPropagation();
  });
  modalLayer.appendChild(modal);

  const diffDisplayTable = document.createElement('table');
  modal.appendChild(diffDisplayTable);

  const continuousLineChangeBuffer = [];

  for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {
    const change = changes[changeIdx];
    const nextChange = changeIdx < changes.length - 1 ? changes[changeIdx + 1] : {};

    switch (change.editType) {
      case 'NO_CHANGE':
        diffDisplayTable.appendChild(createDisplayRow('', comparison.right[change.currLineIdx]));
        break;
      case 'LINE_CHANGE':
        diffDisplayTable.appendChild(createDisplayRow('-', comparison.left[change.prevLineIdx]));
        continuousLineChangeBuffer.push(createDisplayRow('+', comparison.right[change.currLineIdx]));

        if (nextChange.editType !== 'LINE_CHANGE') {
          while (continuousLineChangeBuffer.length > 0) {
            diffDisplayTable.appendChild(continuousLineChangeBuffer.shift());
          }
        }

        break;
      case 'INSERTION':
        diffDisplayTable.appendChild(createDisplayRow('+', comparison.right[change.currLineIdx]));
        break;
      case 'DELETION':
        diffDisplayTable.appendChild(createDisplayRow('-', comparison.left[change.prevLineIdx]));
        break;
    }
  }

  document.querySelector('.reviewable-page').appendChild(modalLayer);
}

function prettifyDiffTable(diffTable) {
  const comparison = extractDiff(diffTable);
  const changes = computeDiff(comparison);

  displayChanges(comparison, changes);
}

function addPrettifyButtonsWhenReady() {
  const HEADER_SELECTOR = '.filename-row a'

  const diffTables = document.querySelectorAll('.sidebyside');
  const allHeadersReady = Array.prototype.every.call(diffTables, table => !!table.querySelector(HEADER_SELECTOR));

  if (allHeadersReady) {
    for (const diffTable of diffTables) {
      const header = diffTable.querySelector(HEADER_SELECTOR);
      const prettifyButton = document.createElement('button');
      prettifyButton.innerHTML = 'Prettify';
      prettifyButton.addEventListener('click', () => prettifyDiffTable(diffTable))

      header.appendChild(prettifyButton);
    }
  } else {
    setTimeout(() => {
      addPrettifyButtonsWhenReady();
    }, 200);
  }
}

// be reasonably sure that it's a review board page
if (
  document.querySelector('.reviewable-page') &&
  document.getElementById('content_container') &&
  document.getElementById('review-request') &&
  document.getElementById('diffs') &&
  document.querySelector('.diff-container') &&
  document.querySelector('.diff-box')
) {
  addPrettifyButtonsWhenReady();
}
