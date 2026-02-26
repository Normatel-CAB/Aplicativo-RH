/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_739655175")

  // remove field
  collection.fields.removeById("text2984378319")

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "file2984378319",
    "maxSelect": 99,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "arquivo_pdf",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_739655175")

  // add field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2984378319",
    "max": 0,
    "min": 0,
    "name": "arquivo_pdf",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("file2984378319")

  return app.save(collection)
})
