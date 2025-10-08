# Contributing to Signal K LwM2M Bridge

Thank you for your interest in contributing to the Signal K LwM2M Bridge project! 

## Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/signalk-lwm2m-bridge.git
   cd signalk-lwm2m-bridge
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

## Project Structure

- `src/` - TypeScript source code
  - `signalk-client.ts` - Main Signal K WebSocket client
  - `lwm2m-controller.ts` - LwM2M client controller
  - `helpers.ts` - Conversion functions and utilities
  - `mandatory-resources.ts` - LwM2M validation system
- `config/` - Configuration files and LwM2M specifications
- `examples/` - Usage examples and documentation

## Adding New LwM2M Objects

1. **Add XML specification** to `config/lwm2m-object-XXXX.xml`
2. **Restart the application** - mandatory resources cache will auto-update
3. **Update mapping configuration** in `config/signalk-lwm2m-mapping.json`
4. **Test the new object** with real or simulated data

## Testing

- **Manual testing:** `npm start` and monitor console output
- **Validation testing:** Check mandatory resource validation logs
- **Signal K testing:** Use Signal K server with test notifications

## Pull Request Process

1. **Create a feature branch:** `git checkout -b feature/your-feature-name`
2. **Make your changes** with clear, focused commits
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Submit a pull request** with a clear description

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting and conventions
- Add comments for complex logic
- Use descriptive variable and function names

## Reporting Issues

When reporting issues, please include:
- Signal K server version and configuration
- LwM2M client details (if applicable)
- Console log output showing the issue
- Steps to reproduce the problem

## Questions?

Feel free to open an issue for questions about development, architecture, or usage!