import {
  deleteBlock,
  insertTransaction,
  locateBlock,
  replaceBlock,
  StaleTransactionError,
} from '../src/file-edits';

const file = `alias e=Expenses

2024/01/01 A
    e:x    $1
    a:y

2024/01/05 B
    e:x    $1
    a:y

2024/01/03 C
    e:x    $1
    a:y
`;

const blockB = {
  block: '2024/01/05 B\n    e:x    $1\n    a:y',
  firstLine: 6,
  lastLine: 8,
};

describe('locateBlock()', () => {
  test('uses the stored line numbers when they still match', () => {
    expect(locateBlock(file.split('\n'), blockB)).toEqual({
      firstLine: 6,
      lastLine: 8,
    });
  });

  test('finds the block when lines moved', () => {
    const moved = `; new comment\n${file}`;
    expect(locateBlock(moved.split('\n'), blockB)).toEqual({
      firstLine: 7,
      lastLine: 9,
    });
  });

  test('refuses to guess when the block is gone or duplicated', () => {
    const edited = file.replace('2024/01/05 B', '2024/01/06 B');
    expect(() => locateBlock(edited.split('\n'), blockB)).toThrow(
      StaleTransactionError,
    );
    const duplicated = `${file}\n${blockB.block}\n`;
    expect(() =>
      locateBlock(duplicated.split('\n'), { ...blockB, firstLine: 99 }),
    ).toThrow(StaleTransactionError);
  });
});

test('replaceBlock()', () => {
  expect(replaceBlock(file, blockB, '2024/01/05 B2\n    e:x    $2\n    a:y'))
    .toEqual(file.replace('B\n    e:x    $1', 'B2\n    e:x    $2'));
});

describe('deleteBlock()', () => {
  test('removes the block and one blank line', () => {
    expect(deleteBlock(file, blockB)).toEqual(`alias e=Expenses

2024/01/01 A
    e:x    $1
    a:y

2024/01/03 C
    e:x    $1
    a:y
`);
  });

  test('last transaction in the file', () => {
    const blockC = {
      block: '2024/01/03 C\n    e:x    $1\n    a:y',
      firstLine: 10,
      lastLine: 12,
    };
    expect(deleteBlock(file, blockC)).toEqual(`alias e=Expenses

2024/01/01 A
    e:x    $1
    a:y

2024/01/05 B
    e:x    $1
    a:y
`);
  });
});

describe('insertTransaction()', () => {
  const tx = '2024/01/04 New\n    e:x    $1\n    a:y';

  test('after the last transaction dated on or before it', () => {
    expect(insertTransaction(file, tx.replace('01/04', '01/02'), '2024-01-02'))
      .toEqual(`alias e=Expenses

2024/01/01 A
    e:x    $1
    a:y

2024/01/02 New
    e:x    $1
    a:y

2024/01/05 B
    e:x    $1
    a:y

2024/01/03 C
    e:x    $1
    a:y
`);
  });

  test('uses file order when the file is not sorted', () => {
    // C (01/03) is the last transaction on or before 01/04.
    expect(insertTransaction(file, tx, '2024-01-04')).toEqual(`${file}\n${tx}\n`);
  });

  test('at the end when it is the latest', () => {
    expect(insertTransaction(file, tx.replace('01/04', '02/01'), '2024-02-01'))
      .toEqual(`${file}\n${tx.replace('01/04', '02/01')}\n`);
  });

  test('before the first transaction when it is the earliest', () => {
    const result = insertTransaction(file, tx.replace('2024', '2023'), '2023-01-04');
    expect(result.startsWith(`alias e=Expenses\n\n2023/01/04 New\n    e:x    $1\n    a:y\n\n2024/01/01 A`)).toBe(true);
  });

  test('in an empty file', () => {
    expect(insertTransaction('', tx, '2024-01-04')).toEqual(`${tx}\n`);
    expect(insertTransaction('; comment\n\n\n', tx, '2024-01-04')).toEqual(
      `; comment\n\n${tx}\n`,
    );
  });

  test('without blank lines between transactions or a trailing newline', () => {
    expect(
      insertTransaction('2024/01/01 A\n  e:x  $1\n  a:y\n2024/01/09 B\n  e:x  $1\n  a:y', tx, '2024-01-04'),
    ).toEqual(`2024/01/01 A\n  e:x  $1\n  a:y\n\n${tx}\n\n2024/01/09 B\n  e:x  $1\n  a:y`);
  });

  test('keeps CRLF line endings', () => {
    const crlf = file.replace(/\n/g, '\r\n');
    expect(insertTransaction(crlf, tx, '2024-01-04')).not.toMatch(/[^\r]\n/);
  });
});
