/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.fields.removeById("bool3214598701")
  collection.fields.removeById("bool3214598702")
  collection.fields.removeById("bool3214598710")
  collection.fields.removeById("bool3214598711")

  unmarshal({
    "listRule": "id = @request.auth.id",
    "viewRule": "id = @request.auth.id",
    "updateRule": "id = @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool3214598701",
    "name": "aprovado",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool3214598702",
    "name": "is_admin",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool3214598710",
    "name": "rh_aprovado",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool3214598711",
    "name": "rh_is_admin",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
})
