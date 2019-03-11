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

  // each dividedDiffBlock is a block that's separated by omitted common lines (e.g. +20 lines)
  // here we add each block separated to the overall diff blocks array
  const dividedDiffBlocks = [];

  let dividedDiffBlock = {
    leftLines: [],
    rightLines: [],
  }

  for (const diffSection of diffTable.getElementsByTagName('tbody')) {
    const sectionType = diffSection.className.split(' ')[0];

    if (sectionType === 'diff-header' && dividedDiffBlock.rightLines.length > 0) {
      dividedDiffBlocks.push(dividedDiffBlock);

      dividedDiffBlock = {
        leftLines: [],
        rightLines: [],
      };
    }

    for (const line of diffSection.getElementsByTagName('tr')) {
      const leftLine = line.querySelector('td.l');
      const rightLine = line.querySelector('td.r');

      const [leftLineNumber, rightLineNumber] = Array.prototype.map.call(line.querySelectorAll('th'), el => parseInt(el.textContent.replace(/[\s\n]/g, '')));

      let leftContent, rightContent;

      switch (sectionType) {
        case 'replace':
        case 'equal':
          leftContent = leftLine.querySelector('pre').textContent;
          dividedDiffBlock.leftLines.push({
            number: leftLineNumber,
            content: leftContent.replace(/\n/g, '')
          });

          rightContent = rightLine.querySelector('pre').textContent;
          dividedDiffBlock.rightLines.push({
            number: rightLineNumber,
            content: rightContent.replace(/\n/g, '')
          });
        break;

        case 'insert':
          rightContent = rightLine.querySelector('pre').textContent;
          dividedDiffBlock.rightLines.push({
            number: rightLineNumber,
            content: rightContent.replace(/\n/g, '')
          });
        break;

        case 'delete':
          leftContent = leftLine.querySelector('pre').textContent;
          dividedDiffBlock.leftLines.push({
            number: leftLineNumber,
            content: leftContent.replace(/\n/g, '')
          });
        break;
      }
    }
  }

  // push remaining diff block, if there is one
  if (dividedDiffBlock.rightLines.length > 0) {
    dividedDiffBlocks.push(dividedDiffBlock);
  }

  // WHAT'S WRONG
  // We changed the way we push lines to leftLines and rightLines, messing up the line indices

  return {
    filename: diffTable.querySelector('.filename-row').textContent.replace(/[\s\n]/g, ''),
    dividedDiffBlocks
  };
}

function computeDiff(fileComparison) {
  const leftLines = fileComparison.leftLines;
  const rightLines = fileComparison.rightLines;

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
      const isSameLine = leftLines[leftIdx - 1].content === rightLines[rightIdx - 1].content;

      const lineDiff = lineDifference(leftLines[leftIdx - 1].content, rightLines[rightIdx - 1].content);

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

  const lineNumberDisplay = document.createElement('td');
  lineNumberDisplay.innerHTML = changeValue.number;
  lineDisplay.appendChild(lineNumberDisplay);

  const changeValueDisplay = document.createElement('td');

  if (changeValue) {
    changeValueDisplay.innerHTML = changeValue.content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  } else {
    console.log(`ERROR: changeValue is undefined`);
  }

  lineDisplay.appendChild(changeValueDisplay);

  return lineDisplay;
}

/**
 * Create DOM elements to display the computed changesd
 * @param {Object} processedFileData contains the filename and file lines (line number and content) divided into blocks
 * @param {Array} totalChanges contains the change descriptors (change type, indices)
 */
function displayChanges(processedFileData, totalChanges) {

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
  modal.style.height = '90%';
  modal.style.overflowY = 'scroll';
  modal.style.fontFamily = 'monospace';
  modal.style.fontSize = '8pt';
  modal.style.whiteSpace = 'pre-wrap';
  modal.style.padding = '10px';
  modal.addEventListener('click', evt => {
    evt.stopPropagation();
  });
  modalLayer.appendChild(modal);

  const filenameDisplay = document.createElement('div');
  filenameDisplay.innerHTML = processedFileData.filename;
  filenameDisplay.style.fontWeight = 'bold';
  filenameDisplay.style.paddingBottom = '10px';
  modal.appendChild(filenameDisplay);

  const diffDisplayTable = document.createElement('table');
  modal.appendChild(diffDisplayTable);

  const continuousLineChangeBuffer = [];

  for (let blockIdx = 0; blockIdx < totalChanges.length; blockIdx++) {
    const changesInBlock = totalChanges[blockIdx];
    const fileDataBlock = processedFileData.dividedDiffBlocks[blockIdx];

    for (let changeIdx = 0; changeIdx < changesInBlock.length; changeIdx++) {
      const change = changesInBlock[changeIdx];
      const nextChange = changeIdx < changesInBlock.length - 1 ? changesInBlock[changeIdx + 1] : {};

      switch (change.editType) {
        case 'NO_CHANGE':
          diffDisplayTable.appendChild(createDisplayRow('', fileDataBlock.rightLines[change.currLineIdx] || '&nbsp;'));
          break;
        case 'LINE_CHANGE':
          diffDisplayTable.appendChild(createDisplayRow('-', fileDataBlock.leftLines[change.prevLineIdx] || '&nbsp;'));
          continuousLineChangeBuffer.push(createDisplayRow('+', fileDataBlock.rightLines[change.currLineIdx] || '&nbsp;'));

          if (nextChange.editType !== 'LINE_CHANGE') {
            while (continuousLineChangeBuffer.length > 0) {
              diffDisplayTable.appendChild(continuousLineChangeBuffer.shift());
            }
          }

          break;
        case 'INSERTION':
          diffDisplayTable.appendChild(createDisplayRow('+', fileDataBlock.rightLines[change.currLineIdx] || '&nbsp;'));
          break;
        case 'DELETION':
          diffDisplayTable.appendChild(createDisplayRow('-', fileDataBlock.leftLines[change.prevLineIdx] || '&nbsp;'));
          break;
      }
    }

    if (blockIdx < totalChanges.length - 1) {
      const nextFileDataBlock = processedFileData.dividedDiffBlocks[blockIdx + 1];

      // subtract last line number of current block from first line number of next block to get the number of omitted lines
      const omittedLinesCount = nextFileDataBlock.rightLines[0].number - fileDataBlock.rightLines[fileDataBlock.rightLines.length - 1].number - 1;

      const blockDividerRow = document.createElement('tr');
      const blockDividerCell = document.createElement('td');
      blockDividerCell.innerHTML = `${omittedLinesCount} lines`;
      blockDividerCell.style.backgroundColor = '#e4d9cb';
      blockDividerCell.style.textAlign = 'center';
      blockDividerCell.colSpan = 3; // span across entire table
      blockDividerRow.appendChild(blockDividerCell);
      diffDisplayTable.appendChild(blockDividerRow);
    }
  }

  document.querySelector('.reviewable-page').appendChild(modalLayer);
}

function prettifyDiffTable(diffTable) {
  const processedFileData = extractDiff(diffTable);

  // totalChanges is an array of block changes
  const totalChanges = processedFileData.dividedDiffBlocks.map(computeDiff);

  displayChanges(processedFileData, totalChanges);
}

window.addEventListener('scroll', () => {
  const diffTables = document.querySelectorAll('.diff-box > .sidebyside');

  const windowHeight = window.innerHeight;

  for (let diffTableIdx = 0; diffTableIdx < diffTables.length; diffTableIdx++) {
    const diffTable = diffTables[diffTableIdx];
    const boundingRect = diffTable.getBoundingClientRect();

    let prettifyButton = diffTable.querySelector('.prettify-button');

    if (boundingRect.y < windowHeight - 130 && boundingRect.bottom > 0) {
      if (!prettifyButton) {
        prettifyButton = document.createElement('button');
        prettifyButton.className = 'prettify-button';

        prettifyButton.style.width = '100px';
        prettifyButton.style.height = '30px';
        prettifyButton.style.borderRadius = '15px';
        prettifyButton.style.fontSize = '15px';
        prettifyButton.style.backgroundColor = 'white';
        prettifyButton.style.color = '#0084bf';
        prettifyButton.style.outline = 'none';
        prettifyButton.style.border = 'none';
        prettifyButton.style.boxShadow = '0 0 6px #0084bf';
        prettifyButton.style.cursor = 'pointer';
        prettifyButton.innerHTML = 'Prettify';
        prettifyButton.addEventListener('click', () => prettifyDiffTable(diffTable))
        diffTable.appendChild(prettifyButton);
      }

      prettifyButton.style.visibility = 'visible';

      if (boundingRect.bottom > windowHeight) {
        prettifyButton.style.position = 'fixed';
        prettifyButton.style.bottom = '40px';
        prettifyButton.style.left = '-20px';
      } else {
        prettifyButton.style.position = 'absolute';
        prettifyButton.style.left = '-36px';
      }
    } else {
      if (prettifyButton) {
        prettifyButton.style.visibility = 'hidden';
      }
    }
  }
})
