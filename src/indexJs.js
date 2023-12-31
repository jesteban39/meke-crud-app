import fs from 'fs'
import path from 'path'

import {getAlias, getListModels, getColums} from './models.js'

const ROOT = path.join('../crud-app')
const TEMPLETES = path.join('./src/templetesJs/')
const CONTROLLERS = [] // ['All', 'Create', 'Edit', 'Delete']

const capitalizer = (str) => {
  return [
    str.charAt(0).toUpperCase() + str.slice(1),
    str.charAt(0).toLowerCase() + str.slice(1)
  ]
}
const getFils = async (dir) => {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) return reject(err)
      resolve(files)
    })
  })
}

const makeDirectory = async (dir) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dir)) return resolve(dir)
    fs.mkdir(dir, {recursive: true}, (error) => {
      if (error) return reject(error)
      resolve(dir)
    })
  })
}

const getFile = (pathTemplete) => {
  return new Promise((resolve, reject) => {
    fs.readFile(pathTemplete, 'utf8', (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}

const saveFile = (pathNewFile, newFile) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(pathNewFile, newFile, 'utf8', (error) => {
      if (error) reject(error)
      else resolve(pathNewFile)
    })
  })
}

const getPahts = (templeteFile, modelName) => {
  const alias = getAlias(modelName)

  const [folder, file] = templeteFile
    .replaceAll('_', '/')
    .replace('[mn]', alias.folder)
    .replace('[ct]', 'controllers')
    .replace('[rt]', 'routes')
    .replace('[md]', 'models')
    .split('.')

  return {
    templete: path.join(TEMPLETES, templeteFile),
    folder: path.join(ROOT, folder),
    newFile: path.join(ROOT, folder, `${file}.js`)
  }
}

/**
 * Optener los reemplasos {clave: valor}
 * para personalizar el archivo segun los alias del modelo.
 * @param {string} modelName Nombre del modelo.
 * @returns Arreglo de reemplasos.
 */
const getReplacements = (modelName) => {
  const alias = getAlias(modelName)
  return Object.keys(alias).reduce((rpls, a) => {
    rpls.push({find: `<~${a}~>`, value: alias[a]})
    return rpls
  }, [])
}

/**
 * Genera un archivo nuevo a partir de una plantilla.
 * @param {string} templeteFile Nombre del archivo plantilla.
 * @param {string} modelName Nombre del modelo.
 * @returns la rura apsoluta del nuevo archivo generado o bull si el archivo ya existia.
 */
const mekeFile = async (templeteFile, modelName) => {
  const replacements = getReplacements(modelName)
  const paths = getPahts(templeteFile, modelName)
  if (!fs.existsSync(paths.newFile)) {
    await makeDirectory(paths.folder)
    const templete = await getFile(paths.templete)
    const newFile = replacements.reduce(
      (file, {find, value}) => file.replaceAll(find, value),
      templete
    )
    await saveFile(paths.newFile, newFile)
    return paths.newFile
  }
  return null
}

const mekeItemDb = (name, values) => {
  const itemKeys = Object.keys(values)
  const item = itemKeys.reduce((item, key) => {
    return item + `\n\t\t\t${key}: ${values[key]},`
  }, `\n\t\t${name}: {`)
  return item + `\n\t\t},`
}

const getPayloadAddLine = (lineId, modelName) => {
  const alias = getAlias(modelName)

  switch (lineId) {
    case '[rt].index.txt':
      return {
        filePath: path.join(ROOT, 'routes/index.js'),
        lines: [
          {
            find: '/*~Declaration~*/',
            line: `import route${alias.Model} from './${alias.folder}/index.js'`
          },
          {
            find: '/*~Import~*/',
            line: `route.use('/${alias.path}', route${alias.Model})`
          }
        ]
      }
    case '[rt]_[mn].edit.txt':
      return {
        filePath: path.join(ROOT, `routes/${alias.folder}/index.js`),
        lines: CONTROLLERS.reduce((lines, ctrl) => {
          const [Ctr, ctr] = capitalizer(ctrl)
          lines.push({
            find: '/*~Declaration~*/',
            line: `import route${Ctr} from './${ctr}.js'`
          })
          lines.push({
            find: '/*~Import~*/',
            line: `route.use('/${ctr}', route${Ctr})`
          })
          return lines
        }, [])
      }
    case '[md].[mn].txt':
      const colums = getColums(modelName)
      return {
        filePath: path.join(ROOT, `models/${alias.file}`),
        lines: [
          ...colums.map(({name, sequelize}) => ({
            find: '/*~Column~*/',
            line: mekeItemDb(name, sequelize)
          }))
        ]
      }
    case '-[md].[mn].txt':
      return {
        filePath: path.join(ROOT, `models/${alias.file}`),
        lines: [
          {
            find: '',
            line: ''
          }
        ]
      }
    default:
      throw Error(`No payload exists for ${lineId}`)
  }
}

const addLines = async (lineId, modelName) => {
  const {lines, filePath} = getPayloadAddLine(lineId, modelName)
  if (!fs.existsSync(filePath)) throw Error(`${filePath} file does not exist`)
  const originalFile = await getFile(filePath)
  const newFile = lines.reduce((file, {find, line}) => {
    if (file.includes(line)) return file
    return file.replaceAll(`${find}`, `${line}\n${find}\n`)
  }, originalFile)
  await saveFile(filePath, newFile)
}

const generateFiles = async () => {
  const modelNames = getListModels()
  const templeteFils = await getFils(TEMPLETES)
  const filNames = ['[rt].index.txt', '[rt]_[mn].edit.txt', '[md].[mn].txt']

  for (let i = 0; i < modelNames.length; i++) {
    const modelName = modelNames[i]

    await Promise.all(
      templeteFils.map(async (templeteFileName) => {
        const file = await mekeFile(templeteFileName, modelName)
        if (file) console.log(file)
      })
    )

    await Promise.all(
      filNames.map(async (file) => {
        await addLines(file, modelName)
      })
    )
  }
}

generateFiles()
