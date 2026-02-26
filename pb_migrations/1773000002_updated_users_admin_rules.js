/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool3214598702",
    "name": "is_admin",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  unmarshal({
    "listRule": "@request.auth.id != '' && @request.auth.aprovado = true && @request.auth.is_admin = true",
    "viewRule": "@request.auth.id != '' && @request.auth.aprovado = true && @request.auth.is_admin = true",
    "updateRule": "@request.auth.id != '' && @request.auth.aprovado = true && @request.auth.is_admin = true"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.fields.removeById("bool3214598702")

  unmarshal({
    "listRule": null,
    "viewRule": null,
    "updateRule": null
  }, collection)

  return app.save(collection)
})
