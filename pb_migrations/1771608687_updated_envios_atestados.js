/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_739655175")

  // update field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "file2984378319",
    "maxSelect": 99,
    "maxSize": 0,
    "mimeTypes": [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ],
    "name": "arquivo_pdf",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_739655175")

  // update field
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
})
