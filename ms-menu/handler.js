const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

// GET /menu - Obtener todo el menú
module.exports.getMenu = async () => {
  const result = await dynamo.send(new ScanCommand({
    TableName: process.env.MENU_TABLE,
  }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result.Items),
  };
};

// GET /menu/{category} - Obtener productos por categoría
module.exports.getCategory = async (event) => {
  const { category } = event.pathParameters;

  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.MENU_TABLE,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `CAT#${category}`,
    },
  }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(result.Items),
  };
};

// POST /menu - Crear producto
module.exports.createProduct = async (event) => {
  const body = JSON.parse(event.body);
  const productId = uuidv4();

  const item = {
    PK: `CAT#${body.category}`,
    SK: `PROD#${productId}`,
    productId,
    name: body.name,
    description: body.description,
    price: body.price,
    imageUrl: body.imageUrl || "",
    available: true,
    tenantId: "mrsushi",
  };

  await dynamo.send(new PutCommand({
    TableName: process.env.MENU_TABLE,
    Item: item,

  })  );



  return {
    statusCode: 201,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ message: "Producto creado", productId }),
  };
};