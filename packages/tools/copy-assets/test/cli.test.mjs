import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCopyAssetsCliArguments } from '../dist/index.js'

test('uses the default clean copy mode', () => {
  assert.deepEqual(parseCopyAssetsCliArguments([]), {
    mode: 'copy',
    targetDir: undefined,
    clean: true
  })
})

test('accepts one target directory and --no-clean', () => {
  assert.deepEqual(
    parseCopyAssetsCliArguments(['./public/viewer', '--no-clean']),
    {
      mode: 'copy',
      targetDir: './public/viewer',
      clean: false
    }
  )
})

test('recognizes help and version modes', () => {
  assert.equal(parseCopyAssetsCliArguments(['--help']).mode, 'help')
  assert.equal(parseCopyAssetsCliArguments(['-v']).mode, 'version')
})

test('rejects unknown options and multiple targets', () => {
  assert.throws(
    () => parseCopyAssetsCliArguments(['--unknown']),
    /Unknown option/
  )
  assert.throws(
    () => parseCopyAssetsCliArguments(['one', 'two']),
    /Only one target directory/
  )
})
