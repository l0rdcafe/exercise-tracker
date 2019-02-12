const express = require("express");
const bodyParser = require("body-parser");
const { check, validationResult } = require("express-validator/check");
const bcrypt = require("bcrypt");
const knex = require("../db");

const router = express.Router();
const jsonParser = bodyParser.json({ type: "application/json" });

const isValidDate = date => {
  const d = new Date(date);
  return !isNaN(d.getTime());
};

router.post(
  "/users",
  jsonParser,
  [
    check("username")
      .isLength({ min: 1 })
      .trim()
      .escape(),
    check("password")
      .isLength({ min: 8 })
      .trim()
      .escape()
  ],
  async (req, res) => {
    if (!req.body.username) {
      return res.status(400).json({ error: "No username found" });
    }

    if (!req.body.password) {
      return res.status(400).json({ error: "No password found" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: "Invalid input" });
    }

    try {
      const password = await bcrypt.hash(req.body.password, 10);
      const result = await knex.raw("INSERT INTO users (username, password) values (?, ?) RETURNING username", [
        req.body.username,
        password
      ]);
      const { username } = result.rows[0];
      res.status(200).json({ msg: `Username ${username} created.` });
    } catch (e) {
      res.status(400).json({ error: `Could not create username ${req.body.username}` });
    }
  }
);

router.post(
  "/users/exercises",
  jsonParser,
  [
    check("description")
      .isLength({ min: 1 })
      .trim()
      .escape(),
    check("duration")
      .isLength({ min: 1 })
      .trim()
      .escape(),
    check("date")
      .trim()
      .escape()
  ],
  async (req, res) => {
    if (!req.headers.authorization) {
      return res.status(400).json({ error: "Authorization credentials not found" });
    }
    const credentials = req.headers.authorization.split(" ")[1];
    const [username, password] = credentials.split(":");
    try {
      const resp = await knex("users")
        .select("*")
        .where("username", username);

      if (resp.length === 0) {
        return res.status(400).json({ error: "Invalid username or user does not exist" });
      }

      const isValidPassword = await bcrypt.compare(password, resp[0].password);
      if (!isValidPassword) {
        return res.status(400).json({ error: "Wrong password for username" });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ error: "Invalid input data" });
      }

      if (!isValidDate(req.body.date) && req.body.date) {
        return res.status(422).json({ error: "Invalid date" });
      }

      await knex("exercises")
        .insert({
          description: req.body.description,
          user_id: resp[0].id,
          duration: req.body.duration,
          date: req.body.date || null
        })
        .returning("user_id");
      res.status(200).json({ error: `Exercise created for user ${resp[0].username}` });
    } catch (e) {
      console.log(e);
      res.status(400).json({ error: "Could not create exercise." });
    }
  }
);

router.get("/users/exercises?", async (req, res) => {
  if (!req.headers.authorization) {
    return res.status(400).json({ error: "Authorization credentials not found" });
  }

  try {
    const credentials = req.headers.authorization.split(" ")[1];
    const [username, password] = credentials.split(":");
    const resp = await knex("users")
      .select("*")
      .where("username", username);
    if (resp.length === 0) {
      return res.status(400).json({ error: "Invalid username or user does not exist" });
    }

    const isValidPassword = await bcrypt.compare(password, resp[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ error: "Wrong password for username" });
    }

    if (req.query.from && !isValidDate(req.query.from)) {
      return res.status(422).json({ error: "Invalid start date" });
    }

    if (req.query.to && !isValidDate(req.query.to)) {
      return res.status(422).json({ error: "Invalid end date" });
    }

    const query = knex("exercises")
      .select("users.username", "exercises.description", "exercises.duration", "exercises.date")
      .join("users", "users.id", "=", "exercises.user_id")
      .where("exercises.user_id", "=", resp[0].id);

    if (req.query.from) {
      query.andWhere("date", ">=", req.query.from);
    }

    if (req.query.to) {
      query.andWhere("date", "=<", req.query.to);
    }

    if (req.query.limit) {
      query.limit(req.query.limit);
    }
    const result = await query;
    const exercises = [...result];
    res.status(200).json({ exercises });
  } catch (e) {
    console.log(e);
    res.status(404).json({ error: `Exercises for user with ID ${req.params.userId} not found.` });
  }
});

module.exports = router;
