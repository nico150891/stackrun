# Skill: Add a New Tool to the Registry

## Steps

1. **Create the manifest JSON** in `registry/<tool-name>.json`
   - Follow the schema in `src/types/manifest.ts`
   - Use the validation rules from `.claude/rules/manifest-validation.md`
   - Test at least 2 commands per tool

2. **Update the registry index** in `registry/index.json`
   - Add a new entry with `name`, `description`, and `version`

3. **Verify the manifest** compiles against the TypeScript types:
   ```bash
   npx ts-node --esm -e "import m from './registry/<tool>.json' assert { type: 'json' }; console.log(m.name)"
   ```

4. **Test the install flow** (once install command is implemented):
   ```bash
   stackrun install <tool-name>
   stackrun list
   ```

5. **Document** any non-obvious auth setup in the manifest's `description` field.
